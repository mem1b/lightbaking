/*!
 *
 * PluginName: LightBaking.js for Three.js r71
 *
 * This is a cpu lightbaking plugin for Three.js r71
 * This plugin provides a path tracing and own implemented twopass method
 * It's possible to achieve some gi-effects such as colorbleeding, indirect lightning and hard-/softshadows.
 *
 * To achieve the best results we recommend to use the PathTracing Algorithm and Webwokers enabled.
 *
 * @author Dominik Link & Jan Pascal Tschudy
 * University of Applied Sciences Northwestern Switzerland 2015
 *
 */

//------------------------------------//
// IMPORTANT:
// - How to contribute to three.js : https://github.com/mrdoob/three.js/wiki/How-to-contribute-to-three.js
// - Mr.doob's Code Style: https://github.com/mrdoob/three.js/wiki/Mr.doob%27s-Code-Style%E2%84%A2
//
// - https://github.com/mrdoob/three.js/wiki/build.py,-or-how-to-generate-a-compressed-three.js-file
// - http://www.samselikoff.com/blog/some-Javascript-constructor-patterns/
//------------------------------------//

( function (THREE) {
    "use strict";

    //-----------------------------------------------//
    // LightBaking Plugin CTOR
    //-----------------------------------------------//
    THREE.LightBaking = function (parameters) {

        var defConfig = getDefaultConfig();

        // handle parameters
        parameters = parameters || {};
        _config = parse(parameters, defConfig);

        __scene = parameters.scene;

        if (_config.appMode === THREE.LightBaking.ApplicationExecutionEnum.MULTITHREADED && typeof(Worker) === "undefined") {

            alert("Your browser does not support web worker!");
            return undefined;

        }

        if (_config.raycasterImplementation === THREE.LightBaking.RayCasterEnum.OCTREE && typeof(THREE.Octree) === "undefined") {

            alert("Octree not defined in THREE.Octree!");
            return undefined;

        }

        if (_config.uvMethod === THREE.LightBaking.UVMethodEnum.PACKED && typeof(GrowingPacker) === "undefined") {

            alert("Packed uvMethod only available with packer.growing.js!");
            return undefined;

        }

        if (_config.bakingMethod === THREE.LightBaking.BakingMethodEnum.TWOPASS) {

            if (_config.appMode === THREE.LightBaking.ApplicationExecutionEnum.MULTITHREADED) {

                alert("TwoPass-Baking and Multi-Threading is not supported!");
                return undefined;

            }

            if (_config.twoPassPassCount < 0 || _config.twoPassPassCount > 2) {

                alert("Range for TwoPassPassCount 0-2. Please set a valid number of passes!");
                return undefined;

            }

        }

        if (_config.bakingMethod === THREE.LightBaking.BakingMethodEnum.PATHTRACING) {

            _config.twoPassPassCount = 1;

        }

        uvFun = uvFunCtor(_config.uvMethod);
        raycasterFun = raycasterFunCtor(_config.raycasterImplementation);

        // functions available to the outside
        return {

            toJSON: toJSON,
            createFaceVertexLightMapUv: createFaceVertexLightMapUv,
            setOnMeshBaked: setOnMeshBaked,
            setOnFilterOnTextureApplied: setOnFilterOnTextureApplied,
            setAfterExecuted: setAfterExecuted,
            applyGItoScene: applyGItoScene,
            applyPostProcessing: applyPostProcessing,
            run: run,

            debugLightMaps: debugLightMaps,
            exportLightMaps: zipFun.exportLightMaps,
            importLightMaps: zipFun.importLightMaps,

            setWorkerId: setWorkerId,
            incWorkerTaskId: incWorkerTaskId,
            getMeshesToBakeCount: getMeshesToBakeCount,

            log: log
        };

    };

    // globally visble functions/constants
    (function () {

        THREE.LightBaking.parse = parse;

        THREE.LightBaking.getDefaultConfig = getDefaultConfig;

        // someConstants
        // Interpolation techniques
        THREE.LightBaking.ShadingEnum = {
            FLAT: 0,
            PHONG: 1,
            FLATFAST: 2
        };

        // Illumination models
        THREE.LightBaking.IlluminationModelEnum = {
            LAMBERT: 0
        };

        // Run the Application in: TODO
        THREE.LightBaking.ApplicationExecutionEnum = {
            SINGLETHREADED: 0,  // everything in the main ui thread
            ASYNC: 1,           // execute async
            MULTITHREADED: 2    // webworker!
        };

        // BakingMethod
        THREE.LightBaking.BakingMethodEnum = {
            TWOPASS: 0,            // a own implemented method
            PATHTRACING: 1
        };

        // UV Method
        THREE.LightBaking.UVMethodEnum = {
            UNIFORMUNCENTERED: 0,
            UNIFORMCENTERED: 1,
            PACKED: 2
        };

        // Available Filters (has to be a function)
        THREE.LightBaking.FilterEnum = {
            NONE: "noFilter",
            BOX: "boxFilter",
            GAUSS: "gaussFilter"
        };

        THREE.LightBaking.WorkerTaskEnum = {
            MESH: "Mesh",
            FACE: "Face", // not yset supported!
            FINISHED: "Finished" // internally for communication
        };

        // -1 = default(bake all)
        //  0 = bake all which have bakeMe = true(bake only these)
        //  1 = bakeMe True (ignore these to bake)
        THREE.LightBaking.SpecificMeshBakingEnum = {
            DISABLED: -1,
            ENABLED: 0,
            INVERTED: 1
        };

        // -1 = default(raycast all)
        //  0 = raycast all which have intersectMe === True(only intersect these)
        //  1 = intersectMe === True (ignore these to intersect)
        THREE.LightBaking.SpecificRayCastingEnum = {
            DISABLED: -1,
            ENABLED: 0,
            INVERTED: 1
        };

        THREE.LightBaking.RayCasterEnum = {
            THREEJS: 0,
            OCTREE: 1
        };

    })();

    var _config;

    var __debugObjects = [];

    var __scene;
    var __onMeshBaked = [];             // callbacks
    var __onFaceBaked = [];             // callbacks
    var __afterExecuted = [];
    var __onFilterOnMeshApplied = [];
    var __tt0;

    var __lights = [];
    var __sceneObjectsToBake = [];

    /**
     * Some extensions to PointLight, AreaLight and Color in Three js
     * @param origin
     * @returns {*}
     */
    THREE.PointLight.prototype.randomAreaPoint = function (origin) {

        var point;

        if (this.userData.radius !== undefined) {

            if (this.sphere === undefined) {

                this.sphere = new THREE.Sphere(this.position, this.userData.radius);

            }

            point = generateRandomPointOnHemisphere(origin, this.sphere);
            point.add(this.sphere.center);

        }

        return point;
    };

    THREE.AreaLight.prototype.randomAreaPoint = function () {

        var point = generateRandomPointOnPlane(this.quaternion, this.width, this.height);
        point.add(this.position);
        return point;

    };

    THREE.Color.prototype.map = function (f) {

        this.r = f(this.r);
        this.g = f(this.g);
        this.b = f(this.b);

    };

    THREE.Color.prototype.clip = function (i, j) {

        this.map(function (v) {

            return mathFun.clip(v, i, j);

        });

    };

    THREE.Color.prototype.divideScalar = function (scalar) {


        if (scalar !== 0) {

            var invScalar = 1 / scalar;

            this.r *= invScalar;
            this.g *= invScalar;
            this.b *= invScalar;

        } else {

            this.r = 0;
            this.g = 0;
            this.b = 0;

        }

        return this;

    };

    /**
     * Default settings for LightBaking
     * @returns {{debugText: boolean, debugLightmap: boolean, debugVisual: boolean, debugVisualMeshNbr: number, debugVisualProbabilityFilter: number, debugVisualIsSelectedMesh: boolean, debugVisualRT: boolean, debugColorizeUVOffset: boolean, globalAmbient: number, giIntensity: number, textureWidth: number, textureHeight: number, shading: number, illuminationModel: number, uvMethod: number, packingOffset: number, uvSmoothing: number, bakingMethod: number, asyncMeshDelay: number, twoPassPassCount: number, samples: number, pathTracingRecLevel: number, importanceValue: number, specificMeshBaking: *, specificRayCasting: *, raycasterImplementation: number, raycasterPrecision: number, softShadows: boolean, softShadowSamples: number, softShadowIntensity: number, lightAttenuation: boolean, postProcessingFilter: string, workerSource: string, workerLimit: *, workerId: number, workerTaskId: number, workerTaskMode: string, appMode: number, resetUserData: boolean}}
     */
    function getDefaultConfig() {

        return {

            debugText: false,
            debugLightmap: false,
            debugVisual: false,
            debugVisualMeshNbr: 0,
            debugVisualProbabilityFilter: 0.005,
            debugVisualIsSelectedMesh: false,
            debugVisualRT: false,
            debugColorizeUVOffset: false,

            globalAmbient: 0,
            giIntensity: 2,

            textureWidth: 512,
            textureHeight: 512,

            // Shading Technique
            shading: THREE.LightBaking.ShadingEnum.PHONG,

            // Illumination Model
            illuminationModel: THREE.LightBaking.IlluminationModelEnum.LAMBERT,

            // UV
            uvMethod: THREE.LightBaking.UVMethodEnum.PACKED, // 0 - first try, 1 - simple centered, 2 - bin packing approach
            packingOffset: 2,
            uvSmoothing: 0.2,

            bakingMethod: THREE.LightBaking.BakingMethodEnum.PATHTRACING,

            asyncMeshDelay: 0,

            // TWOPass Method
            twoPassPassCount: 2,

            // PathTracing (minimum settings(only direct light))
            samples: 1,
            pathTracingRecLevel: 0,

            //ray direction
            importanceValue: 1,

            // various
            specificMeshBaking: THREE.LightBaking.SpecificMeshBakingEnum.DISABLED,
            specificRayCasting: THREE.LightBaking.SpecificRayCastingEnum.DISABLED,

            raycasterImplementation: THREE.LightBaking.RayCasterEnum.THREEJS,
            raycasterPrecision: 0.0001,

            // softshadows
            softShadows: true,
            softShadowSamples: 1,
            softShadowIntensity: 1,

            lightAttenuation: false,

            // post processing
            postProcessingFilter: THREE.LightBaking.FilterEnum.NONE,

            // worker
            workerSource: "LightBakingWorker.js",
            workerLimit: navigator.hardwareConcurrency,
            workerId: -1,                                   // internally used
            workerTaskId: 0,                                // internally used
            workerTaskMode: THREE.LightBaking.WorkerTaskEnum.MESH,

            appMode: THREE.LightBaking.ApplicationExecutionEnum.MULTITHREADED,

            resetUserData: false

        };

    }

    /**
     * Export settings
     * Doesn't export states or the octree
     * @returns {{}}
     */
    function toJSON() {

        return JSON.stringify(_config);

    }

    /**
     * Parsing a config object.
     * Mainly used to export settings to worker
     * @param input
     */
    function parse(input, defVal) {

        return {

            debugText: (typeof input.debugText === "undefined") ? defVal.debugText : input.debugText,
            debugLightmap: (typeof input.debugLightmap === "undefined") ? defVal.debugLightmap : input.debugLightmap,
            debugVisual: (typeof input.debugVisual === "undefined") ? defVal.debugVisual : input.debugVisual,
            debugVisualMeshNbr: (typeof input.debugVisualMeshNbr === "undefined") ? defVal.debugVisualMeshNbr : input.debugVisualMeshNbr,
            debugVisualProbabilityFilter: (typeof input.debugVisualProbabilityFilter === "undefined") ? defVal.debugVisualProbabilityFilter : input.debugVisualProbabilityFilter,
            globalAmbient: (typeof input.globalAmbient === "undefined") ? defVal.globalAmbient : input.globalAmbient,
            textureWidth: (typeof input.textureWidth === "undefined") ? defVal.textureWidth : input.textureWidth,
            textureHeight: (typeof input.textureHeight === "undefined") ? defVal.textureHeight : input.textureHeight,
            uvSmoothing: (typeof input.uvSmoothing === "undefined") ? defVal.uvSmoothing : input.uvSmoothing,
            debugVisualIsSelectedMesh: (typeof input.debugVisualIsSelectedMesh === "undefined") ? defVal.debugVisualIsSelectedMesh : input.debugVisualIsSelectedMesh,
            debugVisualRT: (typeof input.debugVisualRT === "undefined") ? defVal.debugVisualRT : input.debugVisualRT,
            debugColorizeUVOffset: (typeof input.debugColorizeUVOffset === "undefined") ? defVal.debugColorizeUVOffset : input.debugColorizeUVOffset,

            appMode: (typeof input.appMode === "undefined") ? defVal.appMode : input.appMode,

            // Shading Technique
            shading: (typeof input.shading === "undefined") ? defVal.shading : input.shading,
            // Illumination Model
            illuminationModel: (typeof input.illuminationModel === "undefined") ? defVal.illuminationModel : input.illuminationModel,

            // UV
            uvMethod: (typeof input.uvMethod === "undefined") ? defVal.uvMethod : input.uvMethod,
            packingOffset: (typeof input.packingOffset === "undefined") ? defVal.packingOffset : input.packingOffset,

            bakingMethod: (typeof input.bakingMethod === "undefined") ? defVal.bakingMethod : input.bakingMethod,

            asyncMeshDelay: (typeof input.asyncMeshDelay === "undefined") ? defVal.asyncMeshDelay : input.asyncMeshDelay,

            // (samples / hits) * giIntensity (for our gi method)
            giIntensity: (typeof input.giIntensity === "undefined") ? defVal.giIntensity : input.giIntensity,
            twoPassPassCount: (typeof input.twoPassPassCount === "undefined") ? defVal.twoPassPassCount : input.twoPassPassCount,

            // PathTracing (minimum settings(only direct light))
            samples: (typeof input.samples === "undefined") ? defVal.samples : input.samples,
            pathTracingRecLevel: (typeof input.pathTracingRecLevel === "undefined") ? defVal.pathTracingRecLevel : input.pathTracingRecLevel,

            //importance Value
            importanceValue: (typeof input.importanceValue === "undefined") ? defVal.importanceValue : 1,
            // various
            specificMeshBaking: (typeof input.specificMeshBaking === "undefined") ? defVal.specificMeshBaking : input.specificMeshBaking,
            specificRayCasting: (typeof input.specificRayCasting === "undefined") ? defVal.specificRayCasting : input.specificRayCasting,
            raycasterPrecision: (typeof input.raycasterPrecision === "undefined") ? defVal.raycasterPrecision : input.raycasterPrecision,
            raycasterImplementation: (typeof input.raycasterImplementation === "undefined") ? defVal.raycasterImplementation : input.raycasterImplementation,
            lightAttenuation: (typeof input.lightAttenuation === "undefined") ? defVal.lightAttenuation : input.lightAttenuation,

            // post processing
            postProcessingFilter: (typeof input.postProcessingFilter === "undefined") ? defVal.postProcessingFilter : input.postProcessingFilter,

            // softShadows
            softShadows: (typeof input.softShadows === "undefined") ? defVal.softShadows : input.softShadows,
            softShadowSamples: (typeof input.softShadowSamples === "undefined") ? defVal.softShadowSamples : input.softShadowSamples,
            softShadowIntensity: (typeof input.softShadowIntensity === "undefined") ? defVal.softShadowIntensity : input.softShadowIntensity,

            // worker
            workerSource: (typeof input.workerSource === "undefined") ? defVal.workerSource : input.workerSource,
            workerLimit: (typeof input.workerLimit === "undefined") ? defVal.workerLimit : input.workerLimit,
            workerId: (typeof input.workerId === "undefined") ? defVal.workerId : input.workerId,

            resetUserData: (typeof input.resetUserData === "undefined") ? defVal.resetUserData : input.resetUserData

        }

    }

    /**
     *
     * @type {{appendTask, setup, setOnWorkerFinished, setOnTasksFinished, terminateAll, forEach}}
     */
    var cachedWorkerThreadPool = (function () {

        var running = 0;
        var workerLimit = 0;
        var workerSrc;

        // ordinary array
        var workerArr = [];

        // Treat as a stack
        var availableWorker = [];

        // simple LinkedList implementation to handle tasks
        var firstPendingTask = null;
        var lastPendingTask = null;

        var onTaskMessage; // function callback
        var onTasksFinished; // function callback

        function setup(pSceneJSON, pBakingConfigJSON, pworkerSource, pworkerLimit) {

            workerSrc = pworkerSource;
            workerLimit = pworkerLimit;

            initializeWorkerArr();
            initializeWorker(pSceneJSON, pBakingConfigJSON);

        }

        function initializeWorker(pSceneJSON, pBakingConfigJSON) {
            var i;

            for (i = 0; i < workerLimit; i++) {

                workerArr[i].postMessage({
                    task: {intent: "Setup"},
                    workerId: i,
                    sceneJSON: pSceneJSON,
                    bakingConfigJSON: pBakingConfigJSON
                });

            }

        }

        function getRunningWorkerCount() {

            return running;

        }

        function setOnTaskMessage(cb) {

            onTaskMessage = cb;

        }

        function setOnTasksFinished(cb) {

            onTasksFinished = cb;

        }

        function initializeWorkerArr() {

            var i, worker;

            log("raycastCachedThreadPool() - initializeWorkerArr() - initialize: " + workerLimit + " workers");

            for (i = 0; i < workerLimit; i++) {

                worker = new Worker(workerSrc);
                worker.onmessage = onMessage;
                workerArr[i] = worker;
                availableWorker[i] = i;

            }

        }

        function terminateAll() {

            workerArr.forEach(function (w) {

                w.terminate();

            });

            workerArr = [];

        }

        function getAvailableWorkerId() {

            return availableWorker.pop();

        }

        function appendAvailableWorkerId(id) {

            log("wot(" + id + ") is available - worker running#: " + running);
            availableWorker.push(id);

        }

        function appendTaskToQueue(task) {

            log("raycastCachedThreadPool() - appendTaskToQueue(): " + task.intent + ": " + task.uuid);

            if (firstPendingTask === null) {

                firstPendingTask = {task: task, next: null};

            } else {

                if (lastPendingTask === null) {

                    lastPendingTask = {task: task, next: null};
                    firstPendingTask.next = lastPendingTask;

                } else {

                    lastPendingTask.next = {task: task, next: null};
                    lastPendingTask = lastPendingTask.next;

                }

            }

            executeNextTask();

        }

        function getNextTask() {

            var task = null;

            if (firstPendingTask !== null) {

                task = firstPendingTask.task;
                firstPendingTask = firstPendingTask.next;

                if (firstPendingTask === lastPendingTask) {

                    lastPendingTask = null;

                }

            }

            return task;

        }

        function anyNextTasks() {

            return firstPendingTask !== null;

        }

        function executeNextTask() {

            var task;
            var worker;
            var id = getAvailableWorkerId();

            if (id >= 0) {

                worker = workerArr[id];
                task = getNextTask();

                if (task !== null) {

                    running = running + 1;
                    worker.postMessage({task: task, workerId: id});

                } else {

                    appendAvailableWorkerId(id);

                }

            }

        }

        function onMessage(event) {


            log(event.data.workerId + ": onMessage(" + event.data.intent + ")");

            if (event.data.intent === THREE.LightBaking.WorkerTaskEnum.FINISHED) {

                --running;
                appendAvailableWorkerId(event.data.workerId);

            }

            if (onTaskMessage !== undefined) {

                onTaskMessage(event);

            }

            if (anyNextTasks()) {

                executeNextTask();

            } else {

                // no new tasks & no running tasks -> call onTasksFinished()
                if (running === 0) {

                    onTasksFinished();

                }

            }


        }

        function forEach(cb) {

            workerArr.forEach(function (element, index) {

                cb(element, index);

            });

        }

        return {

            appendTask: appendTaskToQueue,
            setup: setup,
            setOnTaskMessage: setOnTaskMessage,
            setOnTasksFinished: setOnTasksFinished,
            terminateAll: terminateAll,
            forEach: forEach,
            getRunningWorkerCount: getRunningWorkerCount

        };

    })();

    var raycasterFun;
    var raycasterFunCtor = function (implementation) {

        var _sceneObjectsToIntersect = [];
        var _octree;

        /**
         *  ??? - modifyOctree
         * @param mesh
         * @param useFaces
         * @param octree
         */
        function modifyOctree(mesh, useFaces) {

            _octree.add(mesh, {useFaces: useFaces});

        }

        function ctor() {
            switch (implementation) {
                case THREE.LightBaking.RayCasterEnum.THREEJS:


                    break;

                case THREE.LightBaking.RayCasterEnum.OCTREE:

                    _octree = new THREE.Octree({
                        // when undeferred = true, objects are inserted immediately
                        // instead of being deferred until next octree.update() call
                        // this may decrease performance as it forces a matrix update
                        undeferred: false,
                        // set the max depth of tree
                        depthMax: Infinity,
                        // max number of objects before nodes split or merge
                        objectsThreshold: 1,
                        // percent between 0 and 1 that nodes will overlap each other
                        // helps insert objects that lie over more than one node
                        overlapPct: 0
                        // pass the scene to visualize the octree
                        //scene: __scene
                    });

                    break;

                default :


            }
        }

        function allMeshesAdded() {

            return (function () {

                switch (implementation) {
                    case THREE.LightBaking.RayCasterEnum.THREEJS:

                        return function () {
                        };

                    case THREE.LightBaking.RayCasterEnum.OCTREE:

                        return function () {

                            _octree.update();

                        };

                    default:

                        return undefined;

                }

            })();

        }

        function addMesh() {

            return (function () {

                switch (implementation) {
                    case THREE.LightBaking.RayCasterEnum.THREEJS:

                        return function (mesh) {

                            _sceneObjectsToIntersect.push(mesh);

                        };

                    case THREE.LightBaking.RayCasterEnum.OCTREE:

                        return function (mesh) {

                            modifyOctree(mesh, true);

                        };

                    default:

                        return undefined;

                }

            })();

        }

        function resetSceneObjectsToIntersect() {

            _sceneObjectsToIntersect = [];

        }

        function getSceneObjectsToIntersectCount() {

            return _sceneObjectsToIntersect.length;

        }

        function intersectObjects() {
            return (function () {

                switch (implementation) {
                    case THREE.LightBaking.RayCasterEnum.THREEJS:

                        return function (raycaster, bool) {

                            return raycaster.intersectObjects(_sceneObjectsToIntersect, bool);

                        };

                    case THREE.LightBaking.RayCasterEnum.OCTREE:

                        return function (raycaster) {

                            var octreeResults = _octree.search(raycaster.ray.origin, raycaster.ray.far, true, raycaster.ray.direction);
                            return (raycaster.intersectOctreeObjects(octreeResults));

                        };

                    default:

                        return undefined;

                }

            })();
        }

        return (function () {

            var _addMesh = addMesh();
            var _allMeshesAdded = allMeshesAdded();
            var _intersectObjects = intersectObjects();

            // ctor
            ctor();


            if (_addMesh === undefined || _intersectObjects === undefined) {

                throw new Error("A function for uvFun is not defined...");

            }

            return {

                addMesh: _addMesh,
                allMeshesAdded: _allMeshesAdded,
                intersectObjects: _intersectObjects,
                resetSceneObjectsToIntersect: resetSceneObjectsToIntersect,
                getSceneObjectsToIntersectCount: getSceneObjectsToIntersectCount

            };

        })();

    };

    var uvFun;
    var uvFunCtor = function (mode) {

        // uv space/scope

        /**
         */
        function calcYOffset() {

            var def = function (th, y) {
                return y;
            };

            var def2 = function (th, y) {
                return th - y;
            };

            return (function () {

                switch (mode) {
                    case THREE.LightBaking.UVMethodEnum.UNIFORMUNCENTERED:

                        return def;

                    case THREE.LightBaking.UVMethodEnum.UNIFORMCENTERED:
                    case THREE.LightBaking.UVMethodEnum.PACKED:

                        return def2;


                    default :
                        return def;

                }


            })();
        }

        /**
         */
        function createFaceVertexLightMapUv() {

            var def = function (mesh) {

                mesh.geometry.faceVertexUvs[1] = convlayoutMeshUV(layoutMeshUV(mesh.geometry.faces, mesh.geometry.vertices, _config.uvSmoothing));

            };

            return (function () {

                switch (mode) {
                    case THREE.LightBaking.UVMethodEnum.UNIFORMUNCENTERED:
                    case THREE.LightBaking.UVMethodEnum.UNIFORMCENTERED:

                        return def;

                    case THREE.LightBaking.UVMethodEnum.PACKED:

                        return function (mesh) {

                            var uv = layoutMeshUVPacked(mesh.geometry.faces, mesh.geometry.vertices, _config.packingOffset, mesh.userData.baking.textureWidth);
                            mesh.geometry.faceVertexUvs[1] = uv.uv;
                            mesh.userData.baking.uvInfo = uv.infos;

                        };

                    default:

                        return def;

                }

            })();

        }

        /**
         */
        function previewLightmapsExtension() {

            var colBBx = new THREE.Color(1, 0, 0);

            var def = function (ctx, tw, th, uvmap, offset, ny, uvInfo) {

                var i;

                for (i = 0; i < uvmap.length; i++) {

                    paintBBx(ctx, getMaxima(mathFun.get2dVecs(uvmap[i], tw, th)), colBBx);

                }

                paintGrid(ctx, tw, th, offset, new THREE.Color(0, 0, 1), ny);

            };

            return (function () {

                switch (mode) {
                    case THREE.LightBaking.UVMethodEnum.UNIFORMUNCENTERED:
                    case THREE.LightBaking.UVMethodEnum.UNIFORMCENTERED:

                        return def;

                    case THREE.LightBaking.UVMethodEnum.PACKED:

                        return function (ctx, tw, th, uvmap, offset, ny, uvInfo) {

                            var i;
                            for (i = 0; i < uvmap.length; i++) {

                                paintBBx(ctx, getMaxima(mathFun.get2dVecs(uvmap[i], tw, th)), colBBx);

                                paintBBx(ctx, {
                                    xMin: (uvInfo[i].origin.x * tw),
                                    xMax: ((uvInfo[i].origin.x + uvInfo[i].w) * tw),
                                    yMax: (th - (uvInfo[i].origin.y * th)),
                                    yMin: (th - ((uvInfo[i].origin.y + uvInfo[i].h) * th))
                                }, new THREE.Color(0, 0, 1));

                            }

                        };

                    default:

                        return def;

                }


            })();

        }

        /**
         */
        function calcFaceOffset() {

            return (function () {

                switch (mode) {
                    case THREE.LightBaking.UVMethodEnum.UNIFORMUNCENTERED:

                        return function (faceIndex, ny, offset, uvInfo, tw, th, vec2d) {

                            var maxima = getMaxima(vec2d);

                            return {
                                xBegin: maxima.xMin,
                                xEnd: maxima.xMax,
                                yBegin: maxima.yMin,
                                yEnd: maxima.yMax
                            };


                        };

                    case THREE.LightBaking.UVMethodEnum.UNIFORMCENTERED:

                        return function (faceIndex, ny, offset, uvInfo, tw, th, vec2d) {

                            return {
                                xBegin: ((faceIndex % ny) * offset),
                                xEnd: ((faceIndex % ny) * offset + offset),
                                yBegin: ((Math.floor(faceIndex / ny)) * offset),
                                yEnd: ((Math.floor(faceIndex / ny)) * offset + offset)
                            };

                        };

                    case THREE.LightBaking.UVMethodEnum.PACKED:

                        return function (faceIndex, ny, offset, uvInfo, tw, th, vec2d) {

                            return {
                                xBegin: (uvInfo[faceIndex].origin.x * tw),
                                xEnd: ((uvInfo[faceIndex].origin.x + uvInfo[faceIndex].w) * tw),
                                yBegin: (uvInfo[faceIndex].origin.y * tw),
                                yEnd: ((uvInfo[faceIndex].origin.y + uvInfo[faceIndex].h) * tw)
                            };

                        };

                    default:

                        return undefined;

                }

            })();

        }

        return (function () {

            var _calcFaceOffset = calcFaceOffset();
            var _calcYOffset = calcYOffset();
            var _previewLightmapsExtension = previewLightmapsExtension();
            var _createFaceVertexLightMapUv = createFaceVertexLightMapUv();

            if (_calcFaceOffset === undefined || _calcYOffset === undefined || _previewLightmapsExtension === undefined || _createFaceVertexLightMapUv === undefined) {

                throw new Error("A function for uvFun is not defined...");

            }

            return {

                calcFaceOffset: _calcFaceOffset,
                calcYOffset: _calcYOffset,
                previewLightmapsExtension: _previewLightmapsExtension,
                createFaceVertexLightMapUv: _createFaceVertexLightMapUv

            };

        })();

    };

    var baryFun = (function () {

        /**
         * Returns baryzentric coordinates of a point P with three points.
         * @param A
         * @param B
         * @param C
         * @param P
         * @returns Array size 3
         */
        function getBarycentricCoordinates(A, B, C, P) {

            var l1 = ((B[1] - C[1]) * (P[0] - C[0]) + (C[0] - B[0]) * (P[1] - C[1])) / ((B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]));
            var l2 = ((C[1] - A[1]) * (P[0] - C[0]) + (A[0] - C[0]) * (P[1] - C[1])) / ((B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]));
            var l3 = 1 - l1 - l2;

            return [l1, l2, l3];

        }

        /**
         * Returns a object wich provides
         * @param A provide x,y: Edge A
         * @param B provide x,y: Edge B
         * @param C provide x,y: Edge C
         * @param P provide x,y: Point to check.
         * @param O provide an Offset for reducing seams. Range 0-1
         * @returns {{coords: {l1: number, l2: number, l3: number}, inTri: boolean}}
         */
        function pointInTriangleO(A, B, C, P, O) {

            var min = -O;
            var max = 1 + O;
            var bary = getBarycentricCoordinates(A, B, C, P);
            var inTri = bary.every(function (e) {
                return e >= min && e <= max;
            });

            return {"coords": bary, "inTri": inTri};

        }

        /***
         * Sources:
         * - http://en.wikipedia.org/wiki/Barycentric_coordinate_system#Conversion_between_barycentric_and_Cartesian_coordinates
         * - http://totologic.blogspot.fr/2014/01/accurate-point-in-triangle-test.html
         * @param A provide x,y: Edge A
         * @param B provide x,y: Edge B
         * @param C provide x,y: Edge C
         * @param P provide x,y: Point to check.
         * @returns {boolean}
         */
        function pointInTriangle(A, B, C, P) {

            return pointInTriangleO(A, B, C, P, _config.uvSmoothing);

        }

        /**
         * To determine whether a given point is inside a triangle(1) or in the offset area of the triangle(0)
         * or outside of the extended triangle(-1)
         * @param bary
         * @returns -1 = not in triangle with offset, 0 = in Triangle offset, 1 = in Triangle
         */
        function whereInBary(bary) {

            var min = -_config.uvSmoothing;
            var max = 1 + _config.uvSmoothing;

            var inTri = bary.every(function (e) {
                return e >= 0 && e <= 1;
            });
            var inExtendedTri = bary.every(function (e) {
                return e >= min && e <= max;
            });

            return inTri && inExtendedTri ? 1 : (inExtendedTri === true ? 0 : -1);

        }

        /**
         *  This method is used to determine whether a point in 3D Space is within a triangle in 3D Space
         *  code from: http://stackoverflow.com/questions/22290427/3d-barycentric-point-intersection
         * // in respect to z coordinate!
         * @param A
         * @param B
         * @param C
         * @param P
         * @returns {*[]}
         */
        function isPointInTri3d(A, B, C, P) {

            var ret = [0, 0, -1];

            if (!(A instanceof THREE.Vector3)) {
                A = new THREE.Vector3(A[0], A[1], A[2]);
            }

            if (!(B instanceof THREE.Vector3)) {
                B = new THREE.Vector3(B[0], B[1], B[2]);
            }

            if (!(C instanceof THREE.Vector3)) {
                C = new THREE.Vector3(C[0], C[1], C[2]);
            }

            if (!(P instanceof THREE.Vector3)) {
                P = new THREE.Vector3(P[0], P[1], P[2]);
            }

            var v0 = (C.clone()).sub(A);
            var v1 = (B.clone()).sub(A);
            var v2 = (P.clone()).sub(A);

            var v12 = (v1.clone()).cross(v2);
            var v10 = (v1.clone()).cross(v0);

            var dot1210 = (v12.clone()).dot(v10);
            if (dot1210 < 0) {
                return ret;
            }

            var v02 = (v0.clone()).cross(v2);
            var v01 = (v0.clone()).cross(v1);
            var dot0201 = (v02.clone()).dot(v01);
            if (dot0201 < 0) {
                return ret;
            }

            var denom = v01.length();
            var np = new THREE.Vector3(v12.length() / denom, v02.length() / denom, 0);

            if (np.x + np.y <= 1 && np.z >= 0) {
                return [np.x, np.y, np.z];
            }

            return ret;
        }

        /**
         * Calculates a point on a surface from given baryzentric coordinates.
         * @param bary Baryzentric Coordinates.
         * @param vecA Usually verts[ face.a ]
         * @param vecB Usually verts[ face.b ]
         * @param vecC Usually verts[ face.c ]
         * @returns {THREE.Vector3}
         */
        function calcLocalPoint(bary, vecA, vecB, vecC) {

            return new THREE.Vector3(
                bary[0] * vecA.x + bary[1] * vecB.x + bary[2] * vecC.x,
                bary[0] * vecA.y + bary[1] * vecB.y + bary[2] * vecC.y,
                bary[0] * vecA.z + bary[1] * vecB.z + bary[2] * vecC.z
            );

        }

        /**
         * @param ci
         * @param p
         * @returns {{coords: *, inTri: undefined}}
         */
        function getBary(ci, p) {

            var vec2d = mathFun.get2dVecs(ci.object.geometry.faceVertexUvs[1][ci.faceIndex], ci.object.userData.baking.textureWidth, ci.object.userData.baking.textureHeight);
            var bary = baryFun.getBarycentricCoordinates(vec2d[0], vec2d[1], vec2d[2], p);

            return {"coords": bary, "inTri": undefined};

        }

        return {
            getBarycentricCoordinates: getBarycentricCoordinates,
            pointInTriangle: pointInTriangle,
            pointInTriangleO: pointInTriangleO,
            whereInBary: whereInBary,
            isPointInTri3d: isPointInTri3d,
            calcLocalPoint: calcLocalPoint,
            getBary: getBary
        };

    })();

    var mathFun = (function () {
        /**
         * Clamping function.
         * @param number
         * @param min
         * @param max
         * @returns {number}
         */
        function clip(number, min, max) {
            return Math.max(min, Math.min(number, max));
        }

        /**
         * Returns a random Number between min and max
         * @param min
         * @param max
         * @returns {float}
         */
        function randomBetween(min, max) {

            return Math.random() * (max - min) + min;

        }

        /**
         * Returns the angle between this vector and vector v in radians.
         * @param v1 - Numerical value
         * @param v2 - Numerical value
         * @returns {number}
         */
        function angleTo(v1, v2) {

            var theta = vDot(v1, v2) / (vLength(v1) * vLength(v2));
            // clamp, to handle numerical problems
            return Math.acos(clip(theta, -1, 1));

        }

        /**
         * Computes the dot product of this vector and v.
         * @param v1 - Numerical array
         * @param v2 - Numerical array
         * @returns {number}
         */
        function vDot(v1, v2) {

            return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];

        }

        /**
         * Divides this vector by scalar s.
         * Set vector to ( 0, 0, 0 ) if s == 0.
         * @param scalar - Numerical
         * @param v - Numerical array
         * @returns {Array}
         */
        function vDivideScalar(scalar, v) {

            var vOut = new Array(3);

            if (scalar !== 0) {

                var invScalar = 1 / scalar;
                vOut[0] = v[0] * invScalar;
                vOut[1] = v[1] * invScalar;
                vOut[2] = v[2] * invScalar;

            }

            return vOut;

        }

        /**
         * Computes length of this vector.
         * @param v - Numerical value
         * @returns {number}
         */
        function vLength(v) {

            return Math.sqrt(vDot(v, v));

        }

        /**
         * Normalizes this vector. Transforms this Vector into a Unit vector by dividing the vector by it's length.
         * @param v - Numerical value
         * @returns {*|Array}
         */
        function vNormalize(v) {

            return vDivideScalar(vLength(v), v);

        }

        /**
         * Returns an array with the cross product of a and b.
         * @param a - Numerical array
         * @param b - Numerical array
         * @returns {Array}
         */
        function vCrossVectors(a, b) {

            var vOut = new Array(3);
            var ax = a[0], ay = a[1], az = a[2];
            var bx = b[0], by = b[1], bz = b[2];

            vOut[0] = ay * bz - az * by;
            vOut[1] = az * bx - ax * bz;
            vOut[2] = ax * by - ay * bx;

            return vOut;

        }

        /**
         * This method calculated the axis which is is used to rotate the face
         * @param v1
         * @param v2
         * @returns {*|Array}
         */
        function getRotationAxis(v1, v2) {

            return vNormalize(vCrossVectors(v1, v2));

        }

        /**
         * This method returns the euler rotation matrix for a specific rotation axis and angle
         * @param vec
         * @param angle
         * @returns {*[]}
         */
        function getRotationMatrix(vec, angle) {

            var c = Math.cos(angle);
            var s = Math.sin(angle);
            var vNorm = vNormalize(vec);

            return [vNorm[0] * vNorm[0] * (1 - c) + c,
                vNorm[1] * vNorm[0] * (1 - c) + vNorm[2] * s,
                vNorm[2] * vNorm[0] * (1 - c) - vNorm[1] * s,
                vNorm[0] * vNorm[1] * (1 - c) - vNorm[2] * s,
                vNorm[1] * vNorm[1] * (1 - c) + c,
                vNorm[2] * vNorm[1] * (1 - c) + vNorm[0] * s,
                vNorm[0] * vNorm[2] * (1 - c) + vNorm[1] * s,
                vNorm[1] * vNorm[2] * (1 - c) - vNorm[0] * s,
                vNorm[2] * vNorm[2] * (1 - c) + c];

        }

        /**
         * This method performs a matrix multiplication for a 3x3 matrix and a 3D vector
         * @param v
         * @param m
         * @returns {Array}
         */
        function vApplyMatrix3(v, m) {

            var vOut = new Array(3);
            vOut[0] = m[0] * v[0] + m[3] * v[1] + m[6] * v[2];
            vOut[1] = m[1] * v[0] + m[4] * v[1] + m[7] * v[2];
            vOut[2] = m[2] * v[0] + m[5] * v[1] + m[8] * v[2];
            return vOut;

        }

        /**
         * this method returns the scale matrix which is used in the uv layout method
         * @param s
         * @returns {number[]}
         */
        function getScaleMatrix(s) {

            return [s, 0, 0, 0, s, 0, 0, 0, 1];

        }

        /**
         * this method unwraps a face from 3D space to the 2D space without distortion od changeing the scale.
         * @param face
         * @param verts
         * @param normal
         * @returns {*[]}
         */
        function flattenFace(face, verts, normal) {

            var a = verts[face.a];
            var b = verts[face.b];
            var c = verts[face.c];

            var a1 = [a.x - a.x, a.y - a.y, a.z - a.z];
            var b1 = [b.x - a.x, b.y - a.y, b.z - a.z];
            var c1 = [c.x - a.x, c.y - a.y, c.z - a.z];

            var v = vNormalize([0, 0, 1]);
            var angle = angleTo(normal, v);
            var rotAxis, rotMat;

            // todo work with epsilon?
            if (angle !== 0 && angle !== Math.PI) {

                rotAxis = getRotationAxis(normal, v);
                rotMat = getRotationMatrix(rotAxis, angle);
                b1 = vApplyMatrix3(b1, rotMat);
                c1 = vApplyMatrix3(c1, rotMat);

            }

            // return UVcoords
            return [
                [a1[0], a1[1], 0],
                [b1[0], b1[1], 0],
                [c1[0], c1[1], 0]
            ];

        }


        /**
         * This method flattens a face and an additional point.
         * @param matrixWorld
         * @param face
         * @param verts
         * @param normal
         * @param point
         * @returns {*[]}
         */
        function flattenFaceAndVector(matrixWorld, face, verts, normal, point) {

            var a = verts[face.a].clone().applyMatrix4(matrixWorld);
            var b = verts[face.b].clone().applyMatrix4(matrixWorld);
            var c = verts[face.c].clone().applyMatrix4(matrixWorld);
            var p = point.clone();

            var a1 = [a.x - a.x, a.y - a.y, a.z - a.z];
            var b1 = [b.x - a.x, b.y - a.y, b.z - a.z];
            var c1 = [c.x - a.x, c.y - a.y, c.z - a.z];
            var p1 = [p.x - a.x, p.y - a.y, p.z - a.z];


            var v = vNormalize([0, 0, 1]);
            var angle = angleTo(normal, v);
            var rotAxis, rotMat;

            // todo work with epsilon?
            if (angle !== 0 && angle !== Math.PI) {

                rotAxis = getRotationAxis(normal, v);
                rotMat = getRotationMatrix(rotAxis, angle);
                b1 = vApplyMatrix3(b1, rotMat);
                c1 = vApplyMatrix3(c1, rotMat);
                p1 = vApplyMatrix3(p1, rotMat);
            }

            // return UVcoords
            return [
                [a1[0], a1[1], 0],
                [b1[0], b1[1], 0],
                [c1[0], c1[1], 0],
                [p1[0], p1[1], 0]
            ];

        }

        /**
         * This method scales all the faces of the UV map according to the scale matrix in order to
         * fit the faces within the [0,1]x[0,1] UV square
         * @param uvs
         * @param scaleMat
         * @returns {*}
         */
        function scaleFace(uvs, scaleMat) {
            return uvs.reduce(function (prev, curr) {
                prev.push(vApplyMatrix3(curr, scaleMat));
                return prev;
            }, []);
        }

        /**
         * @param lm
         * @param w
         * @param h
         * @returns {*[]}
         */
        function get2dVecs(lm, w, h) {

            var vecA2d = new Float32Array(2), vecB2d = new Float32Array(2), vecC2d = new Float32Array(2);

            vecA2d[0] = lm[0].x * w;
            vecA2d[1] = h - lm[0].y * h;
            vecB2d[0] = lm[1].x * w;
            vecB2d[1] = h - lm[1].y * h;
            vecC2d[0] = lm[2].x * w;
            vecC2d[1] = h - lm[2].y * h;

            return [vecA2d, vecB2d, vecC2d];

        }

        return {
            clip: clip,
            angleTo: angleTo,
            vDot: vDot,
            vDivideScalar: vDivideScalar,
            vLength: vLength,
            vNormalize: vNormalize,
            vCrossVectors: vCrossVectors,
            getRotationAxis: getRotationAxis,
            getRotationMatrix: getRotationMatrix,
            vApplyMatrix3: vApplyMatrix3,
            getScaleMatrix: getScaleMatrix,
            flattenFace: flattenFace,
            flattenFaceAndVector: flattenFaceAndVector,
            scaleFace: scaleFace,
            get2dVecs: get2dVecs,
            randomBetween: randomBetween
        };

    })();

    var zipFun = (function () {

        var _uvsetFileName = "uvset.js";
        var _bakingFileName = "baking.js";
        var _lightMapFileName = "lightMap.js";
        var _lightMapPngFileName = "lightMap.png";
        var _configFileName = "config.js";

        /**
         * Polyfill from: http://jsfiddle.net/shivasaxena/qnYk4/3/
         * @param ctx
         * @param name
         */
        function saveAs(ctx, name, createBlob) {

            var blob = ctx;
            var url, a;

            if (createBlob) {

                blob = new Blob([ctx.toString()], {
                    type: "text/plain;charset=utf-8"
                });

            }

            url = URL.createObjectURL(blob);

            a = document.createElement("a");
            a.download = name;
            a.href = url;
            a.textContent = "Download " + name;
            a.click();

            document.getElementById("content").appendChild(a);

        }

        /**
         * @param uvjson
         * @returns {*}
         */
        function mapUvJSONToArr(uvjson) {

            return uvjson.reduce(function (prevO, nextO) {

                prevO.push(nextO.reduce(function (prev, next) {

                    prev.push(new THREE.Vector2(next.x, next.y));

                    return prev;

                }, []));

                return prevO;

            }, []);

        }

        /**
         * @returns {*}
         */
        function getCurrentHtmlFileName() {
            return document.location.href.match(/[^\/]+$/)[0];
        }

        /**
         *
         * Export all baked lightmaps into a zip file.
         *
         * Attention:
         * - only works with jszip (source: https://stuk.github.io/jszip/)
         * - if saveAs doesn't work, use FileSaver fromh ttps://github.com/eligrey/FileSaver.js
         *
         * @param scene
         * @param fileName
         */
        function exportLightMaps(fileName, pngBool) {

            var saveFun;
            var content;
            var zip;

            if (pngBool === undefined) {

                pngBool = false;

            }

            if (fileName === undefined || fileName === null) {

                fileName = getCurrentHtmlFileName() + ".zip";

            }

            try {

                if (typeof JSZip === "undefined") {

                    log("JSZip undefined");
                    return;
                }

                if (typeof saveAs === "undefined") {

                    // Fallback(polyfill)
                    saveFun = saveAs;

                } else {

                    saveFun = saveAs;

                }

                zip = new JSZip();

                __scene.traverse(function (m) {

                    var folderName;

                    if (m.userData.baking !== undefined && m.userData.baking.bakeMe === true) {

                        folderName = "mesh" + m.id;
                        if (pngBool) {

                            var canvas = getCanvas(m.userData.baking.textureWidth, m.userData.baking.textureHeight, m.material.lightMap.image.data);
                            var dataurl = canvas.toDataURL("image/png");

                            zip.folder(folderName).file(_lightMapPngFileName, dataurl.substr(dataurl.indexOf(",") + 1), {base64: true});

                        }
                        zip.folder(folderName).file(_lightMapFileName, m.material.lightMap.image.data);
                        zip.folder(folderName).file(_uvsetFileName, JSON.stringify(m.geometry.faceVertexUvs[1]));
                        zip.folder(folderName).file(_bakingFileName, JSON.stringify(m.userData.baking));

                    }

                });

                zip.file(_configFileName, toJSON());

                content = zip.generate({type: "blob"});
                saveFun(content, fileName);

            } catch (e) {

                log(e);

            }
        }

        /**
         * @param scene
         * @param currHtmlFileName
         */
        function importLightMaps(currHtmlFileName, onImported) {

            if (typeof (JSZipUtils) === "undefined") {
                console.log("JSZipUtils not found!");
                return;
            }

            if (__scene === undefined) {

                console.log("No scene defined!");
                return;

            }

            JSZipUtils.getBinaryContent(currHtmlFileName, function (err, data) {
                if (err) {
                    log("JSZipUtils error:(");
                    //showError( elt, err );
                    return;
                }

                try {
                    var zip = new JSZip(data);

                    Object.keys(zip.files).forEach(function (key) {

                        var currFile = zip.files[key];
                        var meshId = -1, mesh = null;
                        var uvArr;
                        var lm;

                        if (currFile.dir) {

                            // get meshid
                            meshId = parseInt(key.match(/\d+/g));
                            if (meshId > 0) {

                                mesh = __scene.getObjectById(meshId, true);

                                if (mesh !== undefined) {

                                    // extract uvset
                                    uvArr = mapUvJSONToArr(JSON.parse((zip.files[key + _uvsetFileName]).asText()));

                                    // extract baking
                                    mesh.userData.baking = JSON.parse((zip.files[key + _bakingFileName]).asText());

                                    // extract lightmap
                                    lm = (zip.files[key + _lightMapFileName]).asUint8Array();

                                    // write data back to mesh
                                    mesh.geometry.faceVertexUvs[1] = uvArr;
                                    updateLightMapTextureOnMesh(lm, mesh, mesh.userData.baking.textureWidth, mesh.userData.baking.textureHeight);

                                } else {

                                    log("Mesh(" + meshId + ") not found in scene..");

                                }
                            } else {

                                log("MeshId not defined!");
                            }

                        }

                    });

                    if (onImported !== undefined) {

                        onImported();

                    }

                } catch (e) {

                    console.log("JSZip error:(");

                }
            });

        }


        return {
            exportLightMaps: exportLightMaps,
            importLightMaps: importLightMaps
        };

    })();

    function getMeshesToBakeCount() {
        return __sceneObjectsToBake.length;
    }

    /**
     * Find closest intersection.
     * @param Intersections
     * @returns {*}
     */
    function closestIntersection(Intersections) {
        return Intersections.reduce(function (prevVal, currVal) {
            return prevVal.distance < currVal.distance ? prevVal : currVal;
        }, Intersections[0]);
    }

    /**
     * Is there any intersection befor the light?
     * @param intersections
     * @param lightDistance
     * @returns {boolean}
     */
    function anyIntersectionBeforeLight(intersections, lightDistance) {
        return intersections.some(function (e) {
            return e.distance < lightDistance;
        });
    }

    /**
     * This method calculates the light attenuation for point lights. The code is
     * ported to JavaScript from the three.js glsl shaders.
     * @param lightDistance
     * @param cutoffDistance
     * @param decayExponent
     * @returns {number}
     */
    function calcLightAttenuation(lightDistance, cutoffDistance, decayExponent) {
        if (decayExponent > 0.0 && cutoffDistance !== 0.0) {
            return Math.pow(Math.clip(1.0 - lightDistance / cutoffDistance, 0, 1), decayExponent);
        }
        return 1.0;
    }

    function Maxima(xMin, xMax, yMin, yMax, zMin, zMax) {
        this.xMax = xMax;
        this.xMin = xMin;
        this.yMax = yMax;
        this.yMin = yMin;
        this.zMax = zMax;
        this.zMin = zMin;

        this.getXD = function () {
            return this.xMax - this.xMin;
        };

        this.getYD = function () {
            return this.yMax - this.yMin;
        };

        this.getZD = function () {
            return this.zMax - this.zMin;
        };

        this.setX = function (min, max) {
            this.xMin = min;
            this.xMax = max;
        };

        this.setY = function (min, max) {
            this.yMin = min;
            this.yMax = max;
        };

        this.setZ = function (min, max) {
            this.zMin = min;
            this.zMax = max;
        };
    }

    /**
     * @param vecArr
     * @returns {Maxima}
     */
    function getMaxima(vecArr) {

        var maxima = new Maxima(vecArr[0][0], vecArr[0][0], vecArr[0][1], vecArr[0][1], vecArr[0][2], vecArr[0][2]);
        var j;

        for (j = 1; j < vecArr.length; j++) {
            if (vecArr[j][0] < maxima.xMin) {

                maxima.xMin = vecArr[j][0];

            }
            if (vecArr[j][0] > maxima.xMax) {

                maxima.xMax = vecArr[j][0];

            }
            if (vecArr[j][1] < maxima.yMin) {

                maxima.yMin = vecArr[j][1];

            }
            if (vecArr[j][1] > maxima.yMax) {

                maxima.yMax = vecArr[j][1];

            }
            if (vecArr[j][2] < maxima.zMin) {

                maxima.zMin = vecArr[j][2];

            }
            if (vecArr[j][2] > maxima.zMax) {

                maxima.zMax = vecArr[j][2];

            }
        }
        return maxima;

    }

    /**
     * @param faces
     * @param verts
     * @returns {*}
     */
    function findMeshMaxima(faces, verts) {

        var uvs = mathFun.flattenFace(faces[0], verts, faces[0].normal.toArray());
        var globMaxima = getMaxima(uvs);
        var i, l, maxima;

        if (!(faces[0].normal instanceof THREE.Vector3)) {

            faces[0].normal = new THREE.Vector3(faces[0].normal.x, faces[0].normal.y, faces[0].normal.z);

        }

        for (i = 1, l = faces.length; i < l; i++) {

            if (!(faces[i].normal instanceof THREE.Vector3)) {

                faces[i].normal = new THREE.Vector3(faces[i].normal.x, faces[i].normal.y, faces[i].normal.z);

            }

            uvs = mathFun.flattenFace(faces[i], verts, faces[i].normal.toArray());
            maxima = getMaxima(uvs);

            if (globMaxima.getXD() < maxima.getXD()) {

                globMaxima.setX(maxima.xMin, maxima.xMax);

            }

            if (globMaxima.getYD() < maxima.getYD()) {

                globMaxima.setY(maxima.yMin, maxima.yMax);

            }

            if (globMaxima.getZD() < maxima.getZD()) {

                globMaxima.setZ(maxima.zMin, maxima.zMax);

            }

        }

        return globMaxima;
    }

    /**
     * Calculates lambert
     * @param normal Normal.
     * @param light Light.
     * @param amb adds this value to intensity(Ambient)
     * @param lightColor Light color.
     * @returns {THREE.Color}
     */
    function getLambert(normal, light, amb, lightColor) {

        var color = new THREE.Color(0, 0, 0);
        var intensity = normal.dot(light) / (normal.length() * light.length());

        color.map(applyThisColor(lightColor, function (v1, v2) {
            return mathFun.clip(intensity * v2 + amb, 0, 1);
        }));

        return color;

    }

    /**
     * This method calculates the incoming light intensity with the lambert formula
     * @param normal
     * @param remote
     * @param local
     * @returns {number}
     */
    function getLambertIndirectL(normal, remote, local) {
        var lightDirection = new THREE.Vector3().subVectors(remote, local);
        return normal.dot(lightDirection) / (normal.length() * lightDirection.length());
    }

    /**
     * @param normal
     * @param remote
     * @param local
     * @returns {number}
     */
    function getLambertIndirectR(normal, remote, local) {
        var lightDirection = new THREE.Vector3().subVectors(local, remote);
        return normal.dot(lightDirection) / (normal.length() * lightDirection.length());
    }

    /**
     * This method calculates the uv map for a mesh. It is not optimized therefore there is
     * a lot waste of space
     * @param faces
     * @param verts
     * @param O
     * @returns {Array}
     */
    function layoutMeshUV(faces, verts, O) {

        var facesLength = faces.length;
        var gridSize = Math.ceil(Math.sqrt(facesLength));

        var maxima = findMeshMaxima(faces, verts);

        var xOffset = maxima.getXD();
        var yOffset = maxima.getYD();
        var zOffset = maxima.getZD();
        var boundingBoxTmp = Math.max(xOffset, yOffset, zOffset);
        var boundingBox = boundingBoxTmp + (boundingBoxTmp * O);

        var scaleFactor = (1 / (gridSize * boundingBox));
        var offset = boundingBox * scaleFactor;

        var scaleMat = mathFun.getScaleMatrix(scaleFactor);

        var faceVertexUvs = new Array(facesLength);
        var i;
        var bbs, xoffset, yoffset, uvs, max;

        var mapuv1 = function (uv) {
            uv[0] -= max.xMin * scaleFactor;
            uv[1] -= max.yMin * scaleFactor;
            return uv;
        };

        for (i = 0; i < facesLength; i++) {

            uvs = mathFun.flattenFace(faces[i], verts, faces[i].normal.toArray());
            max = getMaxima(uvs);
            uvs = mathFun.scaleFace(uvs, scaleMat);

            uvs.map(mapuv1);

            bbs = getMaxima(uvs);
            xoffset = (offset - bbs.xMax) / 2;
            yoffset = (offset - bbs.yMax) / 2;

            uvs.map(function (uv) {
                uv[0] += (i % gridSize) * offset + xoffset;
                uv[1] -= -Math.floor(i / gridSize) * offset - yoffset;
            });

            // TODO int8array?
            faceVertexUvs[i] = [
                [mathFun.clip(uvs[0][0], 0, 1), mathFun.clip(uvs[0][1], 0, 1)],
                [mathFun.clip(uvs[1][0], 0, 1), mathFun.clip(uvs[1][1], 0, 1)],
                [mathFun.clip(uvs[2][0], 0, 1), mathFun.clip(uvs[2][1], 0, 1)]
            ];
        }
        return faceVertexUvs;
    }

    /**
     * To generate the uv map for a geometry. The uv map is optimized by the bin packing algorythm
     * which can be found here: https://github.com/jakesgordon/bin-packing/
     * packer.growing.js has to be included to work appropriately
     * @param {THREE.Face3[]} faces - faces of the geometry
     * @param {THREE.Vector3[]} vertices - vertices of the geometry
     * @param {number} O - offset to prevent seams
     * @param {number] mapSize - The Size of the lightmap to calculate the offset
     * @returns {{uv: Array, infos: Array}}
     */
    function layoutMeshUVPacked(faces, verts, O, mapSize) {
        //Step 1: Flatten face, find maxima (bounding box) and translate it to the origin of the coordinate system
        //and cteate the the flattened array to store the values
        var flattened = [];
        faces.forEach(function (face, idx) {
            var flat = (mathFun.flattenFace(face, verts, face.normal.toArray()));
            var maxima = getMaxima(flat);

            var xT = maxima.xMin;
            var yT = maxima.yMin;

            flat.forEach(function (elem) {
                elem[0] -= xT;
                elem[1] -= yT;
            });

            flattened.push({w: maxima.getXD(), h: maxima.getYD(), faceIndex: idx, points: flat});
        });

        //sort the faces by the height to get best possible packing results
        flattened.sort(function (a, b) {
            return b.h - a.h;
        });

        //use the growing packer to optimize the uv layout
        var packer = new GrowingPacker();
        packer.fit(flattened);

        //find out the bounding box of the packed uvs. As the target uv system is a 1x1 square,
        //the values in the flattened array have to be scaled by the max size (with or height)
        var sx = packer.root.w;
        var sy = packer.root.h;
        var maxSize = Math.max(sx, sy);
        var scaleFactor = 1 / maxSize;

        //resulting uv array for assigning to the geometry and additional information (bounding box,origin)
        //for the light baking afterwards
        var uvs = [];
        var uvInfos = [];
        var centeringTranslate = (O / mapSize) / 2;

        //sort by faceIndex because the UV Index needs to match the corresponding face by the index
        flattened.sort(function (a, b) {
            return a.faceIndex - b.faceIndex;
        });

        //scale each face in the uv and translate it to its final position
        //fill the uv and uvInfos arrays
        flattened.forEach(function (elem) {
                elem.w *= scaleFactor;
                elem.h *= scaleFactor;
                elem.fit.x *= scaleFactor;
                elem.fit.y *= scaleFactor;

                var targetScale = new THREE.Vector2(elem.w * mapSize, elem.h * mapSize);
                var tmpFactor = new THREE.Vector2((targetScale.x - O) / targetScale.x, (targetScale.y - O) / targetScale.y);
                var offsetScaleFactor = new THREE.Vector2(scaleFactor * tmpFactor.x, scaleFactor * tmpFactor.y);

                var vecs = [];
                elem.points.forEach(function (pt) {
                    pt[0] = pt[0] * offsetScaleFactor.x + elem.fit.x + centeringTranslate;
                    pt[1] = pt[1] * offsetScaleFactor.y + elem.fit.y + centeringTranslate;
                    vecs.push(new THREE.Vector2(pt[0], pt[1]));
                });

                uvs.push(vecs);
                uvInfos.push({
                    h: elem.h,
                    w: elem.w,
                    origin: new THREE.Vector2(elem.fit.x, elem.fit.y)
                });
            }
        );

        return {uv: uvs, infos: uvInfos};
    }

    /**
     * @param uvs
     * @returns {Array}
     */
    function convlayoutMeshUV(uvs) {

        var uvOut = new Array(uvs.length);

        uvs.forEach(
            function (e, i) {

                uvOut[i] = [

                    new THREE.Vector2(e[0][0], e[0][1]),
                    new THREE.Vector2(e[1][0], e[1][1]),
                    new THREE.Vector2(e[2][0], e[2][1])

                ];

            }
        );

        return uvOut;
    }

    /**
     * Updates the lightmap Texture on a given Mesh
     * @param texBuf LightMap in form of ArrayBuffer
     * @param mesh The mesh on which the lightmap is applied onto.
     * @param textureWidth Texture width.
     * @param textureHeight Texture height.
     */
    function updateLightMapTextureOnMesh(texBuf, mesh, textureWidth, textureHeight) {
        var tex;
        tex = new THREE.DataTexture(new Uint8Array(texBuf), textureWidth, textureHeight);
        tex.needsUpdate = true;

        // https://github.com/mrdoob/three.js/wiki/Updates

        // we need groupsNeedUpdate because otherwise we don't have a second uv set on our mesh
        mesh.geometry.groupsNeedUpdate = true;
        mesh.geometry.uvsNeedUpdate = true;
        mesh.material.lightMap = tex;
        mesh.material.needsUpdate = true;
    }


    /**
     * @param ppass
     * @param pml
     * @returns {Function}
     */
    var bakeMesh = function (ppass, pml) {
        var pass = ppass;
        var ml = pml;
        var t0;

        /**
         * @param mesh
         * @param m
         * @private
         */
        var _bakeMesh = function (mesh, m) {
            /**
             * @param mesh
             * @returns {Function}
             */


            if (mesh.userData.baking.bakeMe) {

                _config.debugVisualIsSelectedMesh = _config.debugVisual ? _config.debugVisualMeshNbr === m : _config.debugVisualIsSelectedMesh;

                if (_config.debugText) {

                    log("Processing " + (m + 1) + " of " + ml + " meshes. Pass: " + pass + " of " + _config.twoPassPassCount);
                    t0 = Date.now();

                }

                if (mesh.geometry.faces.length !== undefined && mesh.geometry.faces.length !== 0) {

                    lmgen(mesh)();

                }
            }
        };

        var lmgen = function (mesh) {

            var _mesh = mesh;

            return (function () {

                var geo = _mesh.geometry;
                var texBuf;
                var dt;
                var t1;

                log("bakeMesh() - preBaking: meshUUID: " + mesh.uuid);

                texBuf = lightMapGenerationPerLumel(
                    geo.vertices,
                    geo.faces,
                    geo.faceVertexUvs[1],
                    _mesh.matrixWorld,
                    __scene,
                    pass,
                    _mesh.material,
                    _mesh.userData.baking.textureWidth,
                    _mesh.userData.baking.textureHeight,
                    _mesh.uuid,
                    texBuf,
                    _mesh.userData.baking.faceBeginOffset,
                    _mesh.userData.baking.faceEndOffset,
                    _mesh.userData.baking.uvInfo
                );

                updateLightMapTextureOnMesh(texBuf, _mesh, _mesh.userData.baking.textureWidth, _mesh.userData.baking.textureHeight);

                if (_config.debugText) {

                    t1 = Date.now();
                    dt = (t1 - t0);
                    log("bakeMesh() - afterBaking: Time: " + dt + "ms, " + (dt / 1000) + "s");

                }

                __onMeshBaked.forEach(function (f) {

                    f(_mesh);

                });

            });

        };


        return function (mesh, m) { // return from bakeMesh

            if (_config.appMode === THREE.LightBaking.ApplicationExecutionEnum.ASYNC) {

                setTimeout(function () {

                    _bakeMesh(mesh, m);

                }, _config.asyncMeshDelay);

            } else {

                _bakeMesh(mesh, m);

            }

        };


    };

    /**
     * Should only be executed once.
     *
     * This method appends meshes which:
     *  - should be baked to sceneObjectsToBake
     *  - should be traversed by the raycaster to sceneObjectsToIntersect // or octree
     *
     * Additionally it adds the mesh.userData.baking object
     * and fills this object with additional baking information with default values which are not set yet.
     */
    function bakingSetup(cb) {

        var textureLoadingMechanism = [];

        __onMeshBaked = [];
        __onFaceBaked = [];
        __afterExecuted = [];
        __sceneObjectsToBake = [];
        raycasterFun.resetSceneObjectsToIntersect();
        __lights = [];

        textureLoadingMechanism.push((function () {
            raycasterFun.allMeshesAdded();
            log("bakingSetup() - sceneObjectsToBake: " + __sceneObjectsToBake.length + " + sceneObjectsToIntersect: " + raycasterFun.getSceneObjectsToIntersectCount());
            cb();
        }));

        __scene.traverse(function (mesh) {

                mesh.updateMatrixWorld();

                // Handle all lights
                if (mesh instanceof THREE.Light) {

                    __lights.push(mesh);

                } else if (mesh instanceof THREE.Mesh) {

                    // root object: baking
                    if (mesh.userData.baking === undefined || (_config.workerId === -1 && _config.resetUserData)) {

                        mesh.userData.baking = {};

                    }

                    if (_config.workerId === -1 && (mesh.material.map !== undefined && mesh.material.map !== null && mesh.material.image === undefined)) {

                        log("bakingSetup() - Texture to load for Material-uuid: " + mesh.material.uuid);

                        textureLoadingMechanism.push((function (pmaterial, ppath) {

                            var material = pmaterial;
                            var path = ppath;

                            return function () {

                                THREE.ImageUtils.loadTexture(path, THREE.UVMapping, function (texture) {

                                    var canvas, ctx;

                                    if (texture !== undefined) {

                                        canvas = document.createElement("canvas");
                                        canvas.width = texture.image.width;
                                        canvas.height = texture.image.height;
                                        ctx = canvas.getContext("2d");
                                        ctx.drawImage(texture.image, 0, 0);
                                        texture.image = ctx.getImageData(0, 0, texture.image.width, texture.image.height);

                                        material.map = texture;
                                        material.needsUpdate = true;

                                    }

                                    (textureLoadingMechanism.pop())();

                                });

                            };

                        })(mesh.material, mesh.material.map.sourceFile));

                    }

                    switch (_config.specificMeshBaking) {

                        case THREE.LightBaking.SpecificMeshBakingEnum.DISABLED:

                            mesh.userData.baking.bakeMe = true;
                            break;

                        case THREE.LightBaking.SpecificMeshBakingEnum.ENABLED:

                            if (mesh.userData.baking.bakeMe === undefined) {

                                mesh.userData.baking.bakeMe = false;

                            }

                            break;

                        case THREE.LightBaking.SpecificMeshBakingEnum.INVERTED:

                            if (mesh.userData.baking.bakeMe === undefined) {

                                mesh.userData.baking.bakeMe = true;

                            } else {

                                mesh.userData.baking.bakeMe = !mesh.userData.baking.bakeMe;

                            }

                            break;

                    }


                    // textureWidth
                    if (mesh.userData.baking.textureWidth === undefined) {

                        mesh.userData.baking.textureWidth = _config.textureWidth;

                    }

                    // textureHeight
                    if (mesh.userData.baking.textureHeight === undefined) {

                        mesh.userData.baking.textureHeight = _config.textureHeight;

                    }

                    // because we need faceVertexUv[ 1 ] (lightmapuvs) in our pathtracing Method in combination with Phong shading
                    if (isReadyToCreateFaceVertexLightMapUv(mesh)) {

                        if ((_config.appMode !== THREE.LightBaking.ApplicationExecutionEnum.MULTITHREADED) && (mesh.userData.baking.bakeMe || (_config.bakingMethod === THREE.LightBaking.BakingMethodEnum.PATHTRACING && _config.shading === THREE.LightBaking.ShadingEnum.PHONG))) {

                            createFaceVertexLightMapUv(mesh);

                        }

                    } else {

                        mesh.userData.baking.bakeMe = false;

                    }

                    // set material dependent attributes
                    if (mesh.userData.baking.bakeMe && mesh.material instanceof THREE.MeshBasicMaterial || mesh.material instanceof THREE.MeshPhongMaterial || mesh.material instanceof THREE.MeshLambertMaterial) {


                        // begin at 0 if its not otherwise set
                        if (mesh.userData.baking.faceBeginOffset === undefined) {

                            mesh.userData.baking.faceBeginOffset = 0;

                        }


                        // -1 means no uv1 set
                        if (mesh.userData.baking.faceEndOffset === undefined) {

                            mesh.userData.baking.faceEndOffset = (mesh.geometry.faceVertexUvs[1] !== undefined) ? mesh.geometry.faceVertexUvs[1].length : -1;

                        } else {

                            if (_config.workerId > -1) {

                                if (_config.workerTaskMode === THREE.LightBaking.WorkerTaskEnum.MESH && mesh.userData.baking.faceEndOffset === -1 && mesh.userData.baking.bakeMe) {

                                    mesh.userData.baking.faceEndOffset = mesh.geometry.faceVertexUvs[1].length;

                                }


                            } else {

                                if (mesh.geometry.faceVertexUvs[1] !== undefined && mesh.userData.baking.faceEndOffset > mesh.geometry.faceVertexUvs[1].length) {

                                    mesh.userData.baking.faceEndOffset = mesh.geometry.faceVertexUvs[1].length;


                                }

                            }


                        }

                    } else {

                        mesh.userData.baking.bakeMe = false;

                    }

                    // append baking object to mesh.userData and add additional missing attributes
                    // inverseMatrix
                    mesh.userData.baking.inverseMatrix = new THREE.Matrix4();
                    mesh.userData.baking.inverseMatrix.getInverse(mesh.matrixWorld);


                    // specificRayCasting
                    switch (_config.specificRayCasting) {

                        case THREE.LightBaking.SpecificRayCastingEnum.DISABLED:

                            mesh.userData.baking.intersectMe = true;
                            break;

                        case THREE.LightBaking.SpecificRayCastingEnum.ENABLED:

                            if (mesh.userData.baking.intersectMe === undefined) {

                                mesh.userData.baking.intersectMe = false;

                            }

                            break;

                        case THREE.LightBaking.SpecificRayCastingEnum.INVERTED:

                            if (mesh.userData.baking.intersectMe === undefined) {

                                mesh.userData.baking.intersectMe = true;

                            } else {

                                mesh.userData.baking.intersectMe = !mesh.userData.baking.intersectMe;

                            }

                            break;

                    }


                    // we currently support 3 types of Material
                    if (mesh.userData.baking.bakeMe) {

                        __sceneObjectsToBake.push(mesh);

                    }

                    // include or exlude this object for raycasting
                    if (mesh.userData.baking.intersectMe) {

                        raycasterFun.addMesh(mesh);

                    }

                }

            }
        )
        ;

        (textureLoadingMechanism.pop())();

    }

    function isReadyToCreateFaceVertexLightMapUv(mesh) {
        return (mesh.geometry !== undefined && mesh.geometry.faces !== undefined && mesh.geometry.faces.length !== undefined && mesh.geometry.faces.length !== 0);
    }

    /**
     * @param mesh
     */
    function createFaceVertexLightMapUv(mesh) {
        var geo = mesh.geometry;

        if (geo.faceVertexUvs[1] === undefined || geo.faceVertexUvs[1] === null) {

            log("createFaceVertexLightMapUv() - MeshUUID: " + mesh.uuid);

            mesh.geometry.computeFaceNormals();

            uvFun.createFaceVertexLightMapUv(mesh);

            mesh.geometry.groupsNeedUpdate = true;
            mesh.geometry.uvsNeedUpdate = true;
            mesh.material.side = THREE.DoubleSide;

        }

    }

    /**
     * @param cb
     */
    function setOnMeshBaked(cb) {

        __onMeshBaked.push(cb);

    }

    /**
     * @param cb
     */
    function setOnFilterOnTextureApplied(cb) {

        __onFilterOnMeshApplied.push(cb);

    }

    function setAfterExecuted(cb) {

        __afterExecuted.push(cb);

    }

    /**
     * @param onFinished
     */
    function applyGItoScene(onFinished) {

        var meshCount = __sceneObjectsToBake.length;

        // counter, dass erst nachdem alle meshes in einem pass durchgearbeitet wurden
        // auch erst der nächste pass erfolgt.
        setOnMeshBaked(function () {

            var meshesProceeded = 0;
            var pass = 1;

            return function () {

                meshesProceeded++;
                log("Processed: " + meshesProceeded + " of " + meshCount + " Meshes");

                if (meshesProceeded === meshCount) {

                    meshesProceeded = 0;
                    pass++;

                    if (pass <= _config.twoPassPassCount) {

                        __sceneObjectsToBake.forEach(bakeMesh(pass, meshCount));

                    } else {

                        // all passes done & all meshes done

                        if (onFinished !== undefined) {

                            onFinished();

                        }

                    }

                }

            };

        }());

        if (meshCount === 0) {

            onFinished();

        } else {

            __sceneObjectsToBake.forEach(bakeMesh(1, meshCount));

        }


    }

    /**
     * @returns {*}
     */
    function getIPFilter() {

        /**
         * Source: http://www.embege.com/gauss/
         * @type {{gaussFilter: Function, boxFilter: Function}}
         */
        var funcs = {

            gaussFilter: function () {

                var sigma = 1;
                var W = 5;
                var kernel = [];
                var mean = W / 2;
                var sum = 0.0; // For accumulating the kernel values
                var x = 0, y = 0;

                for (x = 0; x < W; ++x) {
                    kernel[x] = [];
                    for (y = 0; y < W; ++y) {
                        kernel[x][y] = Math.exp(-0.5 * (Math.pow((x - mean) / sigma, 2.0) + Math.pow((y - mean) / sigma, 2.0))) / (2 * Math.PI * sigma * sigma);

                        // Accumulate the kernel values
                        sum += kernel[x][y];
                    }
                }

                // Normalize the kernel
                for (x = 0; x < W; ++x) {

                    for (y = 0; y < W; ++y) {

                        kernel[x][y] /= sum;

                    }

                }

                return kernel;

            },

            boxFilter: function () {

                return [[0.075, 0.125, 0.075],
                    [0.125, 0.200, 0.125],
                    [0.075, 0.125, 0.075]];

            }

        };

        return funcs[_config.postProcessingFilter]();

    }

    /**
     */
    function applyPostProcessing() {

        // TODO?: https://de.wikipedia.org/wiki/Bilaterale_Filterung

        var kernel = getIPFilter();

        __sceneObjectsToBake.forEach(function (m) {

            var tx, ty, x, y;
            var preProcessing = m.material.lightMap.image.data;
            var postProcessing = new Array(m.material.lightMap.image.data.length);
            var textureOffset = 0;
            var sum = 0;
            var r, g, b;
            var factor = 1;
            var filterCoeff;

            var offsetKernel = Math.floor(Math.sqrt(kernel.length * kernel[0].length) / 2);

            // TODO randbehandlung?
            for (ty = 1; ty < m.userData.baking.textureHeight - 2; ty++) {

                for (tx = 1; tx < m.userData.baking.textureWidth - 2; tx++) {

                    sum = 0;
                    r = 0;
                    g = 0;
                    b = 0;

                    for (y = -offsetKernel; y <= offsetKernel; y++) {
                        for (x = -offsetKernel; x <= offsetKernel; x++) {

                            filterCoeff = kernel[y + offsetKernel][x + offsetKernel];

                            textureOffset = calcTextureOffset(m.userData.baking.textureWidth, (ty + y), (tx + x), 4);

                            r += (preProcessing[textureOffset] ) * filterCoeff;
                            g += (preProcessing[textureOffset + 1] ) * filterCoeff;
                            b += (preProcessing[textureOffset + 2] ) * filterCoeff;

                        }
                    }

                    textureOffset = calcTextureOffset(m.userData.baking.textureWidth, ty, tx, 4);

                    switch (_config.postProcessingFilter) {
                        case THREE.LightBaking.FilterEnum.BOX:
                            r = (r / factor) | 0;
                            g = (g / factor) | 0;
                            b = (b / factor) | 0;
                            break;
                        case THREE.LightBaking.FilterEnum.GAUSS:
                            break;
                    }

                    if (r > 255) {
                        r = 255;
                    }
                    if (r < 0) {
                        r = 0;
                    }
                    if (g > 255) {
                        g = 255;
                    }
                    if (g < 0) {
                        g = 0;
                    }
                    if (b > 255) {
                        b = 255;
                    }
                    if (b < 0) {
                        b = 0;
                    }

                    postProcessing[textureOffset] = r;
                    postProcessing[textureOffset + 1] = g;
                    postProcessing[textureOffset + 2] = b;
                    postProcessing[textureOffset + 3] = preProcessing[textureOffset + 3];

                }
            }

            updateLightMapTextureOnMesh(postProcessing, m, m.userData.baking.textureWidth, m.userData.baking.textureHeight);

            __onFilterOnMeshApplied.forEach(function (f) {

                f(m);

            });


        });

    }

    /**
     * Calculates time between now and tt0.
     * @returns {number}
     */
    function calcTotalTime() {
        return Date.now() - __tt0;
    }

    /**
     * Creates a JSON from the entire scene (scene.toJSON).
     * It also handles AreaLights which are not supported in r71
     * @returns {*}
     */
    function sceneToJSON() {

        var json = __scene.toJSON();

        json.object.children.forEach(function (ele) {

            // AreaLight is not handled atm, so we do it
            if (ele.type === "AreaLight") {

                __scene.traverse(
                    function (mesh) {

                        if (mesh.uuid === ele.uuid) {

                            ele.intensity = mesh.intensity;

                            ele.width = mesh.width;
                            ele.height = mesh.height;

                            ele.constantAttenuation = mesh.constantAttenuation;
                            ele.linearAttenuation = mesh.linearAttenuation;
                            ele.quadraticAttenuation = mesh.quadraticAttenuation;

                        }

                    }
                );

            }

        });

        json.materials.forEach(function (ele) {

                // Material.map is not handled atm, so we do it
                if (ele.type === "MeshBasicMaterial" || ele.type === "MeshLambertMaterial" || ele.type === "MeshPhongmaterial") {

                    __scene.traverse(
                        function (mesh) {

                            if (mesh.material !== undefined && mesh.material.uuid === ele.uuid && mesh.material.map !== null && mesh.material.map.image.data !== undefined) {

                                ele.map = {image: mesh.material.map.image};

                            }

                        }
                    );

                }

            }
        );

        return json;
    }

    /**
     * Core Logic
     */
    function run(afterBakingCallBack) {

        var workerLimit = _config.workerLimit;

        if (_config.debugText) {

            log("rayTracePreparation()");
            __tt0 = Date.now();

        }

        bakingSetup(function () {

            if (afterBakingCallBack !== undefined) {

                afterBakingCallBack();

            }


            switch (_config.appMode) {
                case THREE.LightBaking.ApplicationExecutionEnum.SINGLETHREADED:
                case THREE.LightBaking.ApplicationExecutionEnum.ASYNC:

                    log("rayTracePreparation() - applyGI");

                    applyGItoScene(executed);

                    break;

                case THREE.LightBaking.ApplicationExecutionEnum.MULTITHREADED:


                    log("rayTracePreparation() - worker Mode");

                    // do not initiate unecessary workers
                    if (_config.workerTaskMode === THREE.LightBaking.WorkerTaskEnum.MESH && (__sceneObjectsToBake.length < workerLimit)) {

                        workerLimit = __sceneObjectsToBake.length;

                    }

                    // setup for all the workers
                    cachedWorkerThreadPool.setup(sceneToJSON(), toJSON(), _config.workerSource, workerLimit);

                    // callback function after all tasks are done
                    cachedWorkerThreadPool.setOnTasksFinished(function () {

                        log("setOnTasksFinished() - all worker Tasks done");

                        cachedWorkerThreadPool.terminateAll();

                        executed();

                    });

                    // callback for a returned worker
                    switch (_config.workerTaskMode) {

                        case THREE.LightBaking.WorkerTaskEnum.MESH:
                        default:

                            cachedWorkerThreadPool.setOnTaskMessage(function (evt) {

                                    if (evt.data.intent === THREE.LightBaking.WorkerTaskEnum.MESH) {

                                        log("onWorkerFinished() - Mesh Mode");

                                        if (evt.data.texBuf !== undefined) {

                                            log("onWorkerFinished() - texBuf.Length: " + evt.data.texBuf.length + " meshUUID: " + evt.data.meshUUID + " finished: " + evt.data.finished);

                                            __sceneObjectsToBake.forEach(function (mesh) {

                                                if (mesh.uuid === evt.data.meshUUID) {

                                                    mesh.geometry.faceVertexUvs[1] = evt.data.uvLightmap;
                                                    mesh.userData.baking.uvInfo = evt.data.uvInfo;

                                                    updateLightMapTextureOnMesh(evt.data.texBuf, mesh, mesh.userData.baking.textureWidth, mesh.userData.baking.textureHeight);

                                                    __onMeshBaked.forEach(function (f) {

                                                        f(mesh);

                                                    });

                                                }

                                            });

                                        }
                                    }

                                }
                            );

                            break;

                        case THREE.LightBaking.WorkerTaskEnum.FACE:

                            // TODO

                            break;

                    }


                    // send each face or mesh to a worker to process
                    __sceneObjectsToBake.forEach(function (mesh) {

                        var faceIndex, faceEnd;


                        switch (_config.workerTaskMode) {

                            case THREE.LightBaking.WorkerTaskEnum.MESH:
                            default :


                                cachedWorkerThreadPool.appendTask({
                                    intent: THREE.LightBaking.WorkerTaskEnum.MESH,
                                    uuid: mesh.uuid
                                });


                                break;

                            case THREE.LightBaking.WorkerTaskEnum.FACE:

                                for (faceIndex = mesh.userData.baking.faceBeginOffset, faceEnd = mesh.userData.baking.faceEndOffset; faceIndex < faceEnd; faceIndex++) {

                                    cachedWorkerThreadPool.appendTask({
                                        intent: THREE.LightBaking.WorkerTaskEnum.FACE,
                                        uuid: mesh.uuid,
                                        faceIndex: faceIndex
                                    });

                                }

                                break;

                        }


                    });

                    break;

            }

        });


    }

    /**
     *
     */
    function executed() {

        var totalTime;

        if (_config.debugText) {

            log("rayTracePreparation() - Baking applied!");

        }

        if (_config.postProcessingFilter !== THREE.LightBaking.FilterEnum.NONE && _config.appMode !== THREE.LightBaking.ApplicationExecutionEnum.MULTITHREADED) {

            log("rayTracePreparation() - apply filtering");
            applyPostProcessing();

        }

        if (_config.debugText) {

            totalTime = calcTotalTime();

            log("Total Time: " + totalTime / 1000 + "s, " + totalTime + "ms");

        }

        if (_config.debugVisual && __debugObjects !== []) {

            __debugObjects.forEach(function (m) {

                __scene.add(m);

            });

        }

        if (_config.debugLightmap && _config.workerId === -1) {

            debugLightMaps();

        }

        __afterExecuted.forEach(function (f) {

            f();

        });

    }

    // internally used for web worker
    function incWorkerTaskId() {

        _config.workerTaskId++;

    }

    function setWorkerId(id) {

        _config.workerId = id;

    }

    /**
     * Opens a window(tab..) in the browser with every created uv lightmap.
     */
    function debugLightMaps() {

        __scene.traverse(function (m) {

            if (m instanceof THREE.Mesh && m.userData.baking.bakeMe) {

                previewLightmaps(m.geometry.faces.length, m.material.lightMap.image.data, m.geometry.faceVertexUvs[1], m.userData.baking.textureWidth, m.userData.baking.textureHeight, m.userData.baking.uvInfo);

            }

        });

    }

    /**
     * @param face
     * @param amb
     * @param bary
     * @param lightDirection
     * @param lightColor
     * @param normalMatrix
     * @returns {*|THREE.Vector3}
     */
    function getPhongShading(face, amb, bary, lightDirection, lightColor, normalMatrix) {

        var interpolNormal = baryFun.calcLocalPoint(bary, face.vertexNormals[0], face.vertexNormals[1], face.vertexNormals[2]);

        interpolNormal.applyMatrix3(normalMatrix).normalize();

        return interpolNormal;
    }

    /**
     * colorizeFace - only used for flatfast shading
     * @param plightmap
     * @param ptw
     * @param pth
     * @returns {{run: Function, getImageData: Function, setup: Function}}
     */
    function colorizeFace(plightmap, ptw, pth) {
        var canvas, ctx;
        var tw = ptw,
            th = pth,
            lightmap = plightmap;

        return {
            run: function (face, faceIndex, color) {
                ctx.beginPath();
                ctx.moveTo(lightmap[faceIndex][0].x * tw, th - lightmap[faceIndex][0].y * th);
                ctx.lineTo(lightmap[faceIndex][1].x * tw, th - lightmap[faceIndex][1].y * th);
                ctx.lineTo(lightmap[faceIndex][2].x * tw, th - lightmap[faceIndex][2].y * th);
                ctx.closePath();
                ctx.fillStyle = "#" + (Math.ceil((255 * color.r))).toString(16) + "" + (Math.ceil((255 * color.g))).toString(16) + "" + (Math.ceil((255 * color.b))).toString(16);
                ctx.fill();
            },

            getImageData: function () {
                var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                return imgData.data;
            },

            // TODO necessary?
            setup: function () {
                canvas = document.createElement("canvas");
                canvas.width = tw;
                canvas.height = th;
                ctx = canvas.getContext("2d");
            }
        };

    }

    /**
     * @param verts
     * @param faces
     * @param faceVertexLightMapUv
     * @param matrixWorld
     * @param scene
     * @param pass
     * @param material
     * @param tw
     * @param th
     * @param meshuuid
     * @param texBuf
     * @returns {*}
     */
    function lightMapGenerationPerLumel(verts, faces, faceVertexLightMapUv, matrixWorld, scene, pass, material, tw, th, meshuuid, texBuf, faceBeginOffset, faceEndOffset, uvInfo, raycaster) {

        if (_config.debugText) {

            log("lightMapGenerationUVtoWorldPerLumel()");

        }

        var vec2d, vecA3d, vecB3d, vecC3d;
        var bary;
        var color, localPoint, face;
        var pointOnLightmap = new Float32Array(2);
        var acc; // var to improve efficency
        var y, x, faceIndex, yOffset;
        var uvOffsets;
        var ny = Math.ceil(Math.sqrt(faces.length));
        var offset = th / ny;
        var al;

        var raycaster = new THREE.Raycaster();
        raycaster.precision = _config.raycasterPrecision;

        var colorizeFaceFun;

        var multiplyColorBy = function (v) {
            var byVal = v;
            return function (vInner) {
                return Math.ceil((byVal * vInner));
            };
        };

        var buf;
        var buf8;

        if (texBuf !== undefined) {

            buf = new ArrayBuffer(texBuf);


        } else {

            buf = new ArrayBuffer(tw * th * 4);

        }

        buf8 = new Uint8Array(buf);

        if (pass < 1) {
            console.assert(pass > 0, "pass must be > 0");
            return;
        }

        if (_config.debugText) {

            log("lightMapGenerationUVtoWorldPerLumel() - faceBeginOffset: " + faceBeginOffset + " faceEndOffset: " + faceEndOffset);

        }


        // - ...
        for (faceIndex = faceBeginOffset; faceIndex < faceEndOffset; faceIndex++) {

            face = faces[faceIndex];

            // Colorize the face on basis of any vertex of the face receives light
            // todo get the most intense light - now we break at the first best light
            if (_config.shading === THREE.LightBaking.ShadingEnum.FLATFAST) {

                if (colorizeFaceFun === undefined || colorizeFaceFun === null) {

                    colorizeFaceFun = colorizeFace(faceVertexLightMapUv, tw, th);
                    colorizeFaceFun.setup();

                }

                // iterate through face.a, face.b, face.c ...
                for (al = 97; al < 100; al++) {

                    color = getDirectColor(null, verts[face[String.fromCharCode(al)]], raycaster, scene, verts, face, matrixWorld);

                    if (!(color.r === 0 && color.g === 0 && color.b === 0)) {

                        break;

                    }

                }

                colorizeFaceFun.run(face, faceIndex, color);
                continue;

            }

            vec2d = mathFun.get2dVecs(faceVertexLightMapUv[faceIndex], tw, th);

            vecA3d = ((verts[face.a]).clone()).applyMatrix4(matrixWorld);
            vecB3d = ((verts[face.b]).clone()).applyMatrix4(matrixWorld);
            vecC3d = ((verts[face.c]).clone()).applyMatrix4(matrixWorld);


            uvOffsets = uvFun.calcFaceOffset(faceIndex, ny, offset, uvInfo, tw, th, vec2d);

            for (y = uvOffsets.yBegin; y < uvOffsets.yEnd; y++) {

                acc = false;

                for (x = uvOffsets.xBegin; x < uvOffsets.xEnd; x++) {

                    yOffset = uvFun.calcYOffset(th, y);

                    pointOnLightmap[0] = x;
                    pointOnLightmap[1] = yOffset;

                    bary = baryFun.pointInTriangleO(vec2d[0], vec2d[1], vec2d[2], pointOnLightmap, _config.uvSmoothing);

                    if (!bary.inTri) {

                        if (acc) {

                            break;

                        }

                        continue;

                    }

                    acc = true;
                    localPoint = baryFun.calcLocalPoint(bary.coords, vecA3d, vecB3d, vecC3d);

                    switch (_config.bakingMethod) {

                        case THREE.LightBaking.BakingMethodEnum.TWOPASS:

                            switch (pass) {
                                case 1:

                                    if (_config.debugColorizeUVOffset) {

                                        switch (baryFun.whereInBary(bary.coords)) {

                                            case -1:

                                                // should not reach this code because we skip via if bary.inTri

                                                break;

                                            case 0:

                                                color = new THREE.Color(0, 1, 0);
                                                break;

                                            case 1:

                                                color = getDirectColor(bary, localPoint, raycaster, scene, verts, face, matrixWorld);

                                                break;

                                        }
                                    } else {

                                        color = getDirectColor(bary, localPoint, raycaster, scene, verts, face, matrixWorld);

                                    }


                                    break;

                                case 2:

                                    var o = calcTextureOffset(tw, yOffset, x, 4);
                                    color = new THREE.Color(material.lightMap.image.data[o], material.lightMap.image.data[o + 1], material.lightMap.image.data[o + 2]);
                                    color.map(function (v) {
                                        return v / 255;
                                    });
                                    color = secondPassRT(localPoint, raycaster, scene, verts, face, matrixWorld, _config.samples, color);

                                    break;

                                default :

                                    break;

                            }

                            break;

                        case THREE.LightBaking.BakingMethodEnum.PATHTRACING:

                            color = calculateLumelColor(getLumelColor(x, yOffset, buf8, tw), bary, localPoint, raycaster, scene, verts, face, matrixWorld);
                            color.clip(0, 1);

                            break;

                        default :

                            break;

                    }

                    color.map(multiplyColorBy(255));
                    setLumelColor(x, yOffset, buf8, color, tw);
                }

            }

            if (__onFaceBaked.length > 0) {
                __onFaceBaked.forEach(function (f) {
                    f(buf, meshuuid);
                });
            }

        }

        return (_config.shading === THREE.LightBaking.ShadingEnum.FLATFAST) ? colorizeFaceFun.getImageData() : buf;
    }

    /**
     * Calculates the lumelOffset in the array.
     * @param textureWidth Texture width.
     * @param yOffset yOffset.
     * @param xOffset xOffset.
     * @param channels How many Channels? 8Bit or 32Bit... 1 or 4... depends!
     * @returns {number}
     */
    function calcTextureOffset(textureWidth, yOffset, xOffset, channels) {

        return ((textureWidth * Math.floor(yOffset) + Math.floor(xOffset)) * channels);

    }


    /**
     * Opens a window with the current lightmap texture.
     * @param that
     * @param faceCount face count
     * @param lightmap lightmap texture - type: canvasArray type
     * @param uvmap uv coords
     * @param tw Texture width
     * @param th Texture height
     */
    function previewLightmaps(faceCount, lightmap, uvmap, tw, th, uvInfo) {

        var canvas, ctx;
        var ny = Math.ceil(Math.sqrt(faceCount));
        var offset = th / ny;

        canvas = getCanvas(tw, th, lightmap);
        ctx = canvas.getContext("2d");

        uvFun.previewLightmapsExtension(ctx, tw, th, uvmap, offset, ny, uvInfo);
        window.open(canvas.toDataURL("image/png"));

    }

    function getCanvas(width, height, data) {
        var canvas, ctx, imgData;
        canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        ctx = canvas.getContext("2d");
        imgData = ctx.getImageData(0, 0, width, height);
        imgData.data.set(data);
        ctx.putImageData(imgData, 0, 0);
        return canvas;
    }

    /**
     * Access lightmap array and set a specific color
     * @param x
     * @param y
     * @param buf8
     * @param color
     * @param th
     */
    function setLumelColor(x, y, buf8, color, textureWidth) {

        var ai = calcTextureOffset(textureWidth, Math.floor(y), Math.floor(x), 4);

        if (ai > 0 && ai < buf8.length) {

            buf8[ai] = color.r;
            buf8[ai + 1] = color.g;
            buf8[ai + 2] = color.b;
            buf8[ai + 3] = 255;

        }

    }

    function getLumelColor(x, y, buf8, textureWidth) {

        var ai = calcTextureOffset(textureWidth, Math.floor(y), Math.floor(x), 4);
        var color = new THREE.Color(0, 0, 0);

        if (ai > 0 && ai < buf8.length) {

            color.setRGB(buf8[ai], buf8[ai + 1], buf8[ai + 2]);

        }

        return color;

    }

    /**
     * Generates a normalized Ray from an Origin Point in a random direction in the normal hemisphere
     * @param origin
     * @param verts
     * @param face
     * @param matrixWorld
     * @returns {*}
     */
    function generateRayDirection(origin, verts, face, matrixWorld) {

        //var o = Origin.clone();
        var pa = ((verts[face.a]).clone()).applyMatrix4(matrixWorld);
        var pb = ((verts[face.b]).clone()).applyMatrix4(matrixWorld);

        var normalMatrix = (new THREE.Matrix3()).getNormalMatrix(matrixWorld);
        var yD = face.normal.clone().applyMatrix3(normalMatrix);
        //yD = face.normal.clone();
        var xD, zD, xR, yR, zR;

        // TODO don't compare references..
        if (origin !== pa) {

            xD = new THREE.Vector3().subVectors(pa, origin).normalize();

        } else {

            xD = new THREE.Vector3().subVectors(pb, origin).normalize();

        }
        zD = new THREE.Vector3().crossVectors(xD, yD).normalize();

        var l = 1;
        xR = mathFun.randomBetween(-l, l);
        var zmax = Math.sin(Math.acos(xR));

        zR = mathFun.randomBetween(-zmax, zmax);

        xD.multiplyScalar(xR * _config.importanceValue);
        zD.multiplyScalar(zR * _config.importanceValue);

        var pointOnFace = new THREE.Vector3().addVectors(xD, zD);
        var len = pointOnFace.length();
        yR = Math.sin(Math.acos(len));
        yD.multiplyScalar(yR);

        return (pointOnFace.add(yD).normalize());
    }

    /**
     * This method henerates a random point on the visible hemisphere of a point light with radius
     * @param origin
     * @param sphere
     * @returns {*}
     */
    function generateRandomPointOnHemisphere(origin, sphere) {
        var xD, zD, xR, yR, zR, r;
        var yD = new THREE.Vector3().subVectors(origin, sphere.center).normalize();

        xD = (yD.y !== 0 && yD.x === 0 && yD.z === 0) ? (new THREE.Vector3(1, 0, 0)) : (new THREE.Vector3().crossVectors(yD, new THREE.Vector3(0, 1, 0)).normalize());
        zD = new THREE.Vector3().crossVectors(xD, yD).normalize();

        r = sphere.radius;
        xR = mathFun.randomBetween(-1, 1);
        var zmax = Math.sin(Math.acos(xR));
        zR = mathFun.randomBetween(-zmax, zmax);

        xD.multiplyScalar(xR);
        zD.multiplyScalar(zR);

        var pointOnCylinder = new THREE.Vector3().addVectors(xD, zD);
        var len = pointOnCylinder.length();

        yR = Math.sin(Math.acos(len));
        yD.multiplyScalar(yR);

        return (pointOnCylinder.add(yD).normalize()).multiplyScalar(r);
    }

    /**
     * This method generates a random point on the surface of an area light
     * @param quaternion
     * @param width
     * @param height
     * @returns {*}
     */
    function generateRandomPointOnPlane(quaternion, width, height) {
        var xD = new THREE.Vector3(1, 0, 0);
        var yD = new THREE.Vector3(0, 1, 0);
        var xR, yR;


        xD.applyQuaternion(quaternion).normalize();
        yD.applyQuaternion(quaternion).normalize();

        width /= 2;
        height /= 2;
        xR = mathFun.randomBetween(-width, width);
        yR = mathFun.randomBetween(-height, height);

        xD.multiplyScalar(xR);
        yD.multiplyScalar(yR);

        return xD.add(yD);
    }

    /**
     * Core Path Tracing logic
     * @param bary
     * @param pointOnSurface
     * @param raycaster
     * @param scene
     * @param verts
     * @param face
     * @param matrixWorld
     * @returns {THREE.Color}
     */
    function calculateLumelColor(color, bary, pointOnSurface, raycaster, scene, verts, face, matrixWorld) {

        var i, rndRayDir;
        var intensity = _config.samples;

        // how many samples per lumel shall we gather?
        for (i = 0; i < _config.samples; i++) {

            rndRayDir = generateRayDirection(pointOnSurface, verts, face, matrixWorld);
            color.add(rendererCalculateLumelColor(bary, pointOnSurface, rndRayDir, raycaster, verts, face, matrixWorld, scene, 0));

        }

        color.divideScalar(intensity);

        return color;
    }

    /**
     * Path Tracing routine to calculate a color for a given lumel
     * @param bary
     * @param origin
     * @param rayDir
     * @param raycaster
     * @param verts
     * @param face
     * @param matrixWorld
     * @param scene
     * @param numLevels
     * @returns {*}
     */
    function rendererCalculateLumelColor(bary, origin, rayDir, raycaster, verts, face, matrixWorld, scene, numLevels, _ci) {

        var intersections, ci;
        var scol = new THREE.Color(0, 0, 0);
        var icol = new THREE.Color(0, 0, 0);
        var dcol = new THREE.Color(0, 0, 0);
        var rd;
        var newBary, newLocalPoint, normalMatrix, icolIntensity, faceNormal;

        if (numLevels > _config.pathTracingRecLevel) {

            return new THREE.Color(0, 0, 0);

        }

        raycaster.set(origin, rayDir);
        intersections = raycasterFun.intersectObjects(raycaster, true);

        // calculate direct lightning - cast a shadow ray to all lightsources to compute
        // the direct light contribution at this specific patch(lumel in our case)
        dcol = getDirectColor(bary, origin, raycaster, scene, verts, face, matrixWorld);

        if (intersections.length === 0) {

            return dcol;

        }

        ci = closestIntersection(intersections);

        if (numLevels !== 0) {

            if (_ci.object.material.map !== undefined && _ci.object.material.map !== null && _ci.object.material.map.image.data !== null) {

                // get color for the current surface from the texture map
                scol = getSurfaceTextureColor(_ci);

                // console.log( "scol texture: " + scol.r + ",  " + scol.g + ", " + scol.b );

            } else {

                // get color for the current surface
                scol = getSurfaceColor(_ci, raycaster);

            }

        }


        rd = generateRayDirection(ci.point, ci.object.geometry.vertices, ci.face, ci.object.matrixWorld);

        newLocalPoint = new THREE.Vector3(0, 0, 0);
        newLocalPoint.copy(ci.point).applyMatrix4(ci.object.userData.baking.inverseMatrix);

        // calculate baryzentric coordinates on new surface
        if (_config.shading === THREE.LightBaking.ShadingEnum.PHONG) {

            newBary = baryFun.getBary(ci, [newLocalPoint.x, newLocalPoint.y]);

        }

        // compute indirect lighting
        if (numLevels < _config.pathTracingRecLevel) {
            icol = rendererCalculateLumelColor(newBary, newLocalPoint, rd, raycaster, ci.object.geometry.vertices, ci.face, ci.object.matrixWorld, scene, numLevels + 1, ci);
        }


        if ((icol.r + icol.g + icol.b) > 0) {

            normalMatrix = (new THREE.Matrix3()).getNormalMatrix(matrixWorld);
            faceNormal = face.normal.clone().applyMatrix3(normalMatrix);
            icolIntensity = getLambertIndirectL(faceNormal, ci.point, origin) * _config.giIntensity;
            icol.multiplyScalar(icolIntensity);
            icol.clip(0, 1);

        }

        return (numLevels === 0) ? dcol.add(icol) : scol.multiply(dcol.add(icol));
    }

    /**
     * getSurfaceColor (code from threejs raytracer)
     * @param intersection
     * @param raycaster
     * @returns {THREE.Color}
     */
    function getSurfaceColor(intersection, raycaster) {

        var mesh, face, material;
        var diffuseColor = new THREE.Color();
        var localPoint = new THREE.Vector3();
        var lumelVector = new THREE.Vector3();

        mesh = intersection.object;
        face = intersection.face;
        material = mesh.material;

        localPoint.copy(intersection.point).applyMatrix4(intersection.object.userData.baking.inverseMatrix);
        lumelVector.subVectors(raycaster.ray.origin, intersection.point).normalize();

        // resolve pixel diffuse color

        if (material instanceof THREE.MeshLambertMaterial ||
            material instanceof THREE.MeshPhongMaterial ||
            material instanceof THREE.MeshBasicMaterial) {

            //diffuseColor.copyGammaToLinear( material.color ); TODO works or not?
            diffuseColor.copyGammaToLinear(material.color);

        } else {

            diffuseColor.setRGB(1, 1, 1);

        }

        if (material.vertexColors === THREE.FaceColors) {

            diffuseColor.multiply(face.color);

        }

        return diffuseColor;

    }

    /**
     * Gets the color from a single lumel in a lightmap
     * @param intersection
     * @returns {THREE.Color}
     */
    function getSurfaceLightMapColor(intersection) {

        var targetdist, targetmesh, targetFace, material, targetpoint, bary3d;
        var texture, flattened, uv0, t0, t1, t2, lumel, o;

        targetdist = intersection.distance;
        targetmesh = intersection.object;
        targetFace = intersection.face;
        material = targetmesh.material;
        targetpoint = intersection.point;

        texture = material.lightMap.image.data;

        flattened = mathFun.flattenFaceAndVector(targetmesh.matrixWorld, targetFace, targetmesh.geometry.vertices, targetFace.normal.toArray(), targetpoint);

        bary3d = baryFun.getBarycentricCoordinates(flattened[0], flattened[1], flattened[2], flattened[3]);
        uv0 = targetmesh.geometry.faceVertexUvs[1][intersection.faceIndex];

        t0 = uv0[0].clone().multiplyScalar(bary3d[0] * targetmesh.userData.baking.textureWidth);
        t1 = uv0[1].clone().multiplyScalar(bary3d[1] * targetmesh.userData.baking.textureWidth);
        t2 = uv0[2].clone().multiplyScalar(bary3d[2] * targetmesh.userData.baking.textureWidth);

        lumel = (t0.add(t1.add(t2)));
        lumel.y = targetmesh.userData.baking.textureHeight - lumel.y;

        o = calcTextureOffset(targetmesh.userData.baking.textureWidth, lumel.y, lumel.x, 4);

        return new THREE.Color((material.color.r * (texture[o + 0] / 255)), (material.color.g * (texture[o + 1] / 255)), (material.color.b * (texture[o + 2] / 255)));

    }

    /**
     * Retrieves color from specific point on a texture
     * @param intersection
     * @returns {THREE.Color}
     */
    function getSurfaceTextureColor(intersection) {

        var targetmesh, targetFace, material, targetpoint, bary3d;
        var texture, flattened, uv0, t0, t1, t2, texel, o, tw, th;

        targetmesh = intersection.object;
        targetFace = intersection.face;
        material = targetmesh.material;
        targetpoint = intersection.point;

        texture = material.map.image.data;
        tw = material.map.image.width;
        th = material.map.image.height;

        flattened = mathFun.flattenFaceAndVector(targetmesh.matrixWorld, targetFace, targetmesh.geometry.vertices, targetFace.normal.toArray(), targetpoint);

        bary3d = baryFun.getBarycentricCoordinates(flattened[0], flattened[1], flattened[2], flattened[3]);
        uv0 = targetmesh.geometry.faceVertexUvs[0][intersection.faceIndex];

        t0 = new THREE.Vector2(uv0[0].x * tw * bary3d[0], uv0[0].y * th * bary3d[0]);
        t1 = new THREE.Vector2(uv0[1].x * tw * bary3d[1], uv0[1].y * th * bary3d[1]);
        t2 = new THREE.Vector2(uv0[2].x * tw * bary3d[2], uv0[2].y * th * bary3d[2]);


        texel = (t0.add(t1.add(t2)));
        texel.y = th - texel.y;

        o = calcTextureOffset(tw, texel.y, texel.x, 4);

        var col = new THREE.Color((texture[o + 0] / 255), (texture[o + 1] / 255), (texture[o + 2] / 255));

        return col;
    }

    /**
     * This method calculates the direct light color for a given point in 3D space.
     * @param bary
     * @param localPoint
     * @param raycaster
     * @param scene
     * @param verts
     * @param face
     * @param matrixWorld
     * @returns {THREE.Color}
     */
    function getDirectColor(bary, localPoint, raycaster, scene, verts, face, matrixWorld) {

        var lightDirection, lightPoint;
        var color = new THREE.Color(0, 0, 0);
        var l, ll, s, ss;
        var light, divFactor;
        var cutoffDistance;
        var lightAttenuation2;

        for (l = 0, ll = __lights.length; l < ll; l++) {

            light = __lights[l];

            if (_config.lightAttenuation && light instanceof THREE.PointLight) {

                cutoffDistance = light.distance !== undefined ? light.distance : 0;
                lightAttenuation2 = light.decay !== undefined ? light.decay : 1;

            } else {

                cutoffDistance = 0;
                lightAttenuation2 = 1;

            }

            if (_config.softShadows === true && ((light instanceof THREE.PointLight && light.userData.radius !== undefined) || light instanceof THREE.AreaLight )) {

                divFactor = _config.softShadowIntensity / _config.softShadowSamples;

                for (s = 0, ss = _config.softShadowSamples; s < ss; s++) {

                    lightPoint = light.randomAreaPoint(localPoint);
                    lightDirection = new THREE.Vector3().subVectors(lightPoint, localPoint);
                    _getDirectColor(matrixWorld, lightDirection, raycaster, scene, localPoint, face, bary, l, color, divFactor, lightAttenuation2, cutoffDistance);

                }

            } else {

                lightDirection = new THREE.Vector3().subVectors(__lights[l].position, localPoint);
                _getDirectColor(matrixWorld, lightDirection, raycaster, scene, localPoint, face, bary, l, color, 1, lightAttenuation2, cutoffDistance);

            }

        }

        color.clip(0, 1);

        return color;
    }

    /**
     * This method is used by the previous method to calculate the direct light color.
     * It was refactored in order to support multiple shadow samples.
     * @param matrixWorld
     * @param lightDirection
     * @param raycaster
     * @param scene
     * @param localPoint
     * @param face
     * @param bary
     * @param l
     * @param color
     * @param deltaDiv
     * @param lightDecay
     * @param lightCutoff
     */
    function _getDirectColor(matrixWorld, lightDirection, raycaster, scene, localPoint, face, bary, l, color, deltaDiv, lightDecay, lightCutoff) {
        var lightDistance, intersections, intersectBeforeLight, intensity;
        var visDebugThis;
        var deltaColor;
        var isVisible;
        var normalMatrix, normalizedSurfaceNormal;
        var calculatedSurfaceNormal = new THREE.Vector3();
        var attenuation;

        normalMatrix = (new THREE.Matrix3()).getNormalMatrix(matrixWorld);
        normalizedSurfaceNormal = face.normal.clone().applyMatrix3(normalMatrix);
        visDebugThis = (_config.debugVisualRT && _config.debugVisualIsSelectedMesh && Math.random() < _config.debugVisualProbabilityFilter);

        // hack to not waste more cpu power
        intensity = normalizedSurfaceNormal.dot(lightDirection) / (normalizedSurfaceNormal.length() * lightDirection.length());

        if (intensity > 0) {

            isVisible = true;

            lightDistance = lightDirection.length();
            raycaster.set(localPoint, lightDirection.normalize());

            intersections = raycasterFun.intersectObjects(raycaster, true);

            if (intersections.length > 0) {

                intersectBeforeLight = anyIntersectionBeforeLight(intersections, lightDistance);

                if (intersectBeforeLight) {

                    isVisible = false;

                }

            }

            if (isVisible) {

                // interpolation technique
                switch (_config.shading) {

                    case THREE.LightBaking.ShadingEnum.FLAT:
                    case THREE.LightBaking.ShadingEnum.FLATFAST:

                        calculatedSurfaceNormal.copy(normalizedSurfaceNormal);

                        break;

                    case THREE.LightBaking.ShadingEnum.PHONG:

                        calculatedSurfaceNormal = getPhongShading(face, _config.globalAmbient, bary.coords, lightDirection, __lights[l].color, normalMatrix);

                        break;

                }

                // illumination model
                switch (_config.illuminationModel) {

                    case THREE.LightBaking.IlluminationModelEnum.LAMBERT:

                        attenuation = calcLightAttenuation(lightDistance, lightCutoff, lightDecay);
                        deltaColor = getLambert(calculatedSurfaceNormal, lightDirection, _config.globalAmbient, __lights[l].color);
                        deltaColor.multiplyScalar(deltaDiv * attenuation);

                        break;

                }

                color.add(deltaColor);

            }


            if (visDebugThis) {

                visDebugThisFun(localPoint, color);

            }

        }

    }

    /**
     * Used to debug the lightmap visually
     * @param pointOnSurface
     * @param color
     */
    function visDebugThisFun(pointOnSurface, color) {

        var debugGeomSphere, debugMat, debugMeshSphere;

        var le2 = pointOnSurface.x > -5.2;
        var le = pointOnSurface.x < -4.9;
        var ri = pointOnSurface.x > 4.75;

        if ((le && le2 && !ri )) {

            debugGeomSphere = new THREE.SphereGeometry(0.02, 2, 2);
            debugMat = new THREE.MeshBasicMaterial();

            if (color.r === 0) {

                debugMat.color.setRGB(1, 0, 0);

            } else {

                debugMat.color.setRGB(0, color.g, 0);

            }

            debugMeshSphere = new THREE.Mesh(debugGeomSphere, debugMat);

            debugMeshSphere.translateX(pointOnSurface.x);
            debugMeshSphere.translateY(pointOnSurface.y);
            debugMeshSphere.translateZ(pointOnSurface.z);
            __debugObjects.push(debugMeshSphere);

        }

    }

    /**
     * This method calculates the indirect color pass for the Two Pass method
     * @param pointOnSurface
     * @param raycaster
     * @param scene
     * @param verts
     * @param face
     * @param matrixWorld
     * @param samples
     * @param currentColor
     * @returns {*}
     */
    function secondPassRT(pointOnSurface, raycaster, scene, verts, face, matrixWorld, samples, currentColor) {

        var color, r;
        var intersections;
        var intensityFactor = samples / _config.giIntensity;
        var visDebugThis = (_config.debugVisual && _config.debugVisualIsSelectedMesh && Math.random() < _config.debugVisualProbabilityFilter);
        var localNormalMatrix = (new THREE.Matrix3()).getNormalMatrix(matrixWorld);
        var localNormalizedSurfaceNormal = face.normal.clone().applyMatrix3(localNormalMatrix);
        var remoteNormalMatrix;
        var remoteNormalizedSurfaceNormal;
        var ci, direction;
        var scol;

        var visDebugThisFun1 = (function () {

            var debugGeomSphere, debugMat, debugMeshSphere;

            debugGeomSphere = new THREE.SphereGeometry(0.02, 8, 8);
            debugMat = new THREE.MeshBasicMaterial();
            debugMat.color.setRGB(1, 0, 0);
            debugMeshSphere = new THREE.Mesh(debugGeomSphere, debugMat);

            debugMeshSphere.translateX(direction.x * 0.3 + pointOnSurface.x);
            debugMeshSphere.translateY(direction.y * 0.3 + pointOnSurface.y);
            debugMeshSphere.translateZ(direction.z * 0.3 + pointOnSurface.z);
            __debugObjects.push(debugMeshSphere);

        });

        var visDebugThisFun2 = (function () {

            var g, lineColor, line;

            g = new THREE.Geometry();
            g.vertices.push(pointOnSurface.clone());
            g.vertices.push(ci.point.clone());
            lineColor = new THREE.LineBasicMaterial();
            lineColor.color.setRGB(color.x, color.y, color.z);

            line = new THREE.Line(g, lineColor);

            __debugObjects.push(line);

        });

        for (r = 0; r < samples; r++) {

            direction = generateRayDirection(pointOnSurface, verts, face, matrixWorld);

            raycaster.set(pointOnSurface, direction);
            intersections = raycasterFun.intersectObjects(raycaster, true);

            if (visDebugThis) {

                visDebugThisFun1();

            }

            if (intersections.length !== 0) {

                ci = closestIntersection(intersections);

                remoteNormalMatrix = (new THREE.Matrix3()).getNormalMatrix(ci.object.matrixWorld);
                remoteNormalizedSurfaceNormal = ci.face.normal.clone().applyMatrix3(remoteNormalMatrix);

                color = getSurfaceLightMapColor(ci);

                if (visDebugThis) {

                    visDebugThisFun2();

                }

                if (ci.object.material.map !== undefined && ci.object.material.map !== null && ci.object.material.map.image.data !== null) {

                    // get color for the current surface from the texture map
                    scol = getSurfaceTextureColor(ci);

                } else {

                    // get color for the current surface
                    scol = getSurfaceColor(ci, raycaster);

                }

                color.multiply(scol);

                if ((color.r + color.g + color.b) > 0) {

                    intensityFactor /= calcLambertianIntensity(localNormalizedSurfaceNormal, remoteNormalizedSurfaceNormal, pointOnSurface, ci.point);
                    color.divideScalar(intensityFactor);
                    color.clip(0, 1);

                    currentColor.map(applyThisColor(color, function (v1, v2) {

                        return v1 + v2;

                    }));

                }


            }

        }

        currentColor.clip(0, 1);

        return currentColor;
    }

    function calcLambertianIntensity(localNormalizedSurfaceNormal, remoteNormalizedSurfaceNormal, localPoint, remotePoint) {

        var intensity = getLambertIndirectL(localNormalizedSurfaceNormal, remotePoint, localPoint) * getLambertIndirectR(remoteNormalizedSurfaceNormal, remotePoint, localPoint);

        if (isNaN(intensity) && intensity < 0) {

            log("calcLambertianIntensity() - intensity not valid: " + intensity);

        }

        return intensity;

    }

    /**
     * @param col
     * @param f
     * @returns {Function}
     */
    function applyThisColor(col, f) {

        var count = 0;
        var oc = col.toArray();

        return function (v) {

            return f(v, oc[count++]);

        };

    }

    /**
     * This method paints a grid for visuualize the cells on the light map
     * @param ctx
     * @param width
     * @param height
     * @param offset
     * @param color
     * @param nx
     */
    function paintGrid(ctx, width, height, offset, color, nx) {

        var x, y;

        ctx.fillStyle = "#" + color.getHexString();

        for (x = 0; x <= nx; x++) {

            ctx.fillRect(x * offset, 0, 1, height);

        }

        for (y = 0; y < nx; y++) {

            ctx.fillRect(0, y * offset, width, 1);

        }

    }

    /**
     * This method paints a box to visualize the bounding box on the light map
     * @param ctx
     * @param maxima
     * @param color
     */
    function paintBBx(ctx, maxima, color) {
        var tw = maxima.xMax - maxima.xMin;
        var th = maxima.yMax - maxima.yMin;
        var x, y;

        ctx.fillStyle = "#" + color.getHexString();

        for (x = maxima.xMin; x < maxima.xMin + tw; x++) {

            ctx.fillRect(x, maxima.yMax, 1, 1);
            ctx.fillRect(x, maxima.yMin, 1, 1);

        }

        for (y = maxima.yMin; y < maxima.yMin + th; y++) {

            ctx.fillRect(maxima.xMin, y, 1, 1);
            ctx.fillRect(maxima.xMax, y, 1, 1);

        }

    }

    /**
     * Use this to log.
     * @param msg
     */
    function log(msg) {

        if (_config.debugText) {

            if (_config.workerId > -1) {

                self.console.log("woT(" + _config.workerId + ", " + _config.workerTaskId + "): " + msg);

            } else {

                console.log("maT    : " + msg);

            }

        }

    }

//Code from https://github.com/jakesgordon/bin-packing/
    var sort = (function () {

        return {

            random: function () {
                return Math.random() - 0.5;
            },
            w: function (a, b) {
                return b.w - a.w;
            },
            h: function (a, b) {
                return b.h - a.h;
            },
            a: function (a, b) {
                return b.area - a.area;
            },
            max: function (a, b) {
                return Math.max(b.w, b.h) - Math.max(a.w, a.h);
            },
            min: function (a, b) {
                return Math.min(b.w, b.h) - Math.min(a.w, a.h);
            },

            height: function (a, b) {
                return this.sort.msort(a, b, ['h', 'w']);
            },
            width: function (a, b) {
                return this.sort.msort(a, b, ['w', 'h']);
            },
            area: function (a, b) {
                return this.sort.msort(a, b, ['a', 'h', 'w']);
            },
            maxside: function (a, b) {
                return this.sort.msort(a, b, ['max', 'min', 'h', 'w']);
            },

            msort: function (a, b, criteria) { /* sort by multiple criteria */
                var diff, n;
                for (n = 0; n < criteria.length; n++) {
                    diff = sort[criteria[n]](a, b);
                    if (diff !== 0) {
                        return diff;
                    }
                }
                return 0;
            },
            execute: function (blocks, type) {
                var sort = type;
                if (sort !== undefined) {
                    blocks.sort(sort[sort]);
                }
            }
        };
    })();

}(THREE));