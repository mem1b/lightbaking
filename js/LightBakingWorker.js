/**
 * Created by Jan Pascal Tschudy on 20.06.2015.
 *
 * Setup has to be the first Method call(before meshTask or faceTask). It initializes the lightBaking Attribute.
 *
 * Future improvements:
 *  - Use structured cloning instead of transferring a json object.
 *
 */

"use strict";

importScripts("three.js");
importScripts("LightBaking.js");

var workerCtx = (function () {

    var lightBaking;
    var sceneRef;
    var intent;
    var workerId;

    function onMessage(e) {

        intent = e.data.task.intent;
        workerId = e.data.workerId;

        switch (e.data.task.intent) {

            case "Setup":

                sceneSetup(e);
                lightBaking.log(intent);

                break;

            case THREE.LightBaking.WorkerTaskEnum.MESH:

                lightBaking.setWorkerId(workerId);
                lightBaking.incWorkerTaskId();
                lightBaking.log(intent);
                meshTask(e);

                break;

            case THREE.LightBaking.WorkerTaskEnum.FACE:

                lightBaking.setWorkerId(workerId);
                lightBaking.incWorkerTaskId();
                lightBaking.log(intent);
                faceTask(e);

                break;

            default :

                self.console.log(intent + " not yet implemented.");
                break;

        }

    }

    function faceTask(e) {

    }

    function meshTask(e) {

        // only bake specific Mesh
        sceneRef.traverse(function (mesh) {

            if (mesh instanceof THREE.Mesh) {

                mesh.userData.baking.bakeMe = ( mesh.uuid === e.data.task.uuid );

            }

        });

        lightBaking.run(function () {
            setListener(JSON.parse(lightBaking.toJSON()));
        });
    }

    function sceneSetup(evt) {

        var scene;
        var config = JSON.parse(evt.data.bakingConfigJSON);

        // must be defined before importScene(), otherwise Octree would be unknown
        if (config.raycasterImplementation === THREE.LightBaking.RayCasterEnum.OCTREE) {

            importScripts("Octree.js");

        }

        // reconstruct scene in worker
        scene = importScene(evt);
        sceneRef = scene;

        // adjust some attributes to work properly in worker
        config.appMode = THREE.LightBaking.ApplicationExecutionEnum.SINGLETHREADED;
        config.specificMeshBaking = THREE.LightBaking.SpecificMeshBakingEnum.ENABLED;
        config.workerId = evt.data.workerId;
        config.scene = scene;

        if (config.uvMethod === THREE.LightBaking.UVMethodEnum.PACKED) {

            importScripts("packer.growing.js");

        }

        lightBaking = new THREE.LightBaking(config);

    }

    function setListener(config) {

        lightBaking.setAfterExecuted(function () {

            lightBaking.log("afterExecuted() - send Finished to main thread.");

            self.postMessage({

                workerId: workerId,
                intent: THREE.LightBaking.WorkerTaskEnum.FINISHED

            });

        });

        if (config.workerTaskMode === THREE.LightBaking.WorkerTaskEnum.MESH) {

            lightBaking.setOnMeshBaked(ownPostMessage);

        }

        if (config.postProcessingFilter !== THREE.LightBaking.FilterEnum.NONE) {

            lightBaking.setOnFilterOnTextureApplied(ownPostMessage);

        }

    }

    function ownPostMessage(mesh) {

        lightBaking.log("setOnMeshBaked() - postMessage, intent:" + intent);

        self.postMessage({

            texBuf: mesh.material.lightMap.image.data,
            uvLightmap: mesh.geometry.faceVertexUvs[1],
            uvInfo: mesh.userData.baking.uvInfo,
            workerId: workerId,
            meshUUID: mesh.uuid,
            intent: intent

        });

    }

    function importScene(evt) {

        var scene;
        // JSONLoader?
        // OBJ Loader?
        // Three.ObjectLoader!
        //   quote: Unlike the JSONLoader, this one make use of the .type attributes of objects to map them to their original classes.

        // ObjectLoader does not handle AreaLights atm.
        var loader = new THREE.ObjectLoader();
        loader.parse(evt.data.sceneJSON, function (obj) {

            var matrix = new THREE.Matrix4();
            var object;

            // ADD AREALIGHT!
            evt.data.sceneJSON.object.children.forEach(function (data) {

                if (data.type === "AreaLight") {

                    object = new THREE.AreaLight(data.color, data.intensity);

                    object.width = data.width;
                    object.height = data.height;

                    object.constantAttenuation = data.constantAttenuation;
                    object.linearAttenuation = data.linearAttenuation;
                    object.quadraticAttenuation = data.quadraticAttenuation;

                    object.uuid = data.uuid;

                    if (data.name !== undefined) {

                        object.name = data.name;

                    }

                    if (data.matrix !== undefined) {

                        matrix.fromArray(data.matrix);
                        matrix.decompose(object.position, object.quaternion, object.scale);

                    } else {

                        if (data.position !== undefined) {

                            object.position.fromArray(data.position);

                        }

                        if (data.rotation !== undefined) {

                            object.rotation.fromArray(data.rotation);

                        }

                        if (data.scale !== undefined) {

                            object.scale.fromArray(data.scale);

                        }

                    }

                    if (data.visible !== undefined) {
                        object.visible = data.visible;
                    }
                    if (data.userData !== undefined) {
                        object.userData = data.userData;
                    }

                    obj.add(object);

                }

            });

            evt.data.sceneJSON.materials.forEach(function (data) {

                if ((data.type === "MeshBasicMaterial" || data.type === "MeshLambertMaterial" || data.type === "MeshPhongmaterial" ) && data.map !== undefined) {

                    obj.traverse(
                        function (mesh) {

                            if (mesh.material !== undefined && mesh.material.uuid === data.uuid) {
                                mesh.material.map = data.map;
                            }

                        }
                    );
                }

            });


            scene = obj;

        });

        return scene;

    }

    return {
        onMessage: onMessage
    };

})();

self.onmessage = function (e) {

    workerCtx.onMessage(e);

};




