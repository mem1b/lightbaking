/**
 * Created by Jan Pascal Tschudy on 17.08.2015.
 */

var lightBakingDemo = function (plbparams) {
    var tracker;
    var runConfig;
    var lbparams = plbparams;


    runConfig = (function () {

        function getRunParams() {

            return lightBakingConfig.runParams;

        }

        var lightbakingDatguiConfig = function () {

            var defParams = THREE.LightBaking.parse(lbparams, THREE.LightBaking.getDefaultConfig());

            this.runParams = JSON.parse(JSON.stringify(defParams));
            this.runParams.scene = lbparams.scene;

            this.appMode = defParams.appMode;
            this.workerLimit = defParams.workerLimit;
            this.debugText = defParams.debugText;
            this.textureSize = defParams.textureHeight;
            this.shading = defParams.shading;

            this.giIntensity = defParams.giIntensity;
            this.lightAttenuation = defParams.lightAttenuation;

            this.postProcessingFilter = defParams.postProcessingFilter;

            this.uvMethod = defParams.uvMethod;
            this.packingOffset = defParams.packingOffset;
            this.uvSmoothing = defParams.uvSmoothing;

            this.samples = defParams.samples;
            this.pathTracingRecLevel = defParams.pathTracingRecLevel;

            this.softShadows = defParams.softShadows;
            this.softShadowSamples = defParams.softShadowSamples;
            this.softShadowIntensity = defParams.softShadowIntensity;

        };

        var box3Gui = new dat.GUI();
        var lightBakingFolder = box3Gui.addFolder('Lightbaking options');
        var lightBakingConfig = new lightbakingDatguiConfig();
        lightBakingFolder.open();

        // Main FOLDER
        lightBakingFolder.add(lightBakingConfig, 'appMode', THREE.LightBaking.ApplicationExecutionEnum).name("Execution Model").onChange(function () {
            lightBakingConfig.runParams.appMode = parseInt(lightBakingConfig.appMode, 10);
        });
        lightBakingFolder.add(lightBakingConfig, 'workerLimit').name("Worker limit").onChange(function () {
            lightBakingConfig.runParams.workerLimit = parseInt(lightBakingConfig.workerLimit, 10);
        }).min(1).step(1);

        lightBakingFolder.add(lightBakingConfig, 'debugText').name("Debug Text").onChange(function () {
            lightBakingConfig.runParams.debugText = lightBakingConfig.debugText;
        });
        lightBakingFolder.add(lightBakingConfig, 'textureSize').name("Lightmap size").onChange(function () {
            lightBakingConfig.runParams.textureWidth = parseInt(lightBakingConfig.textureSize, 10);
            lightBakingConfig.runParams.textureHeight = parseInt(lightBakingConfig.textureSize, 10);
        }).min(2).step(1); // TODO STEP

        lightBakingFolder.add(lightBakingConfig, 'shading', THREE.LightBaking.ShadingEnum).name("Shading").onChange(function () {
            lightBakingConfig.runParams.shading = parseInt(lightBakingConfig.shading, 10);
        });

        lightBakingFolder.add(lightBakingConfig, 'giIntensity').name("Intensity").onChange(function () {
            lightBakingConfig.runParams.giIntensity = parseFloat(lightBakingConfig.giIntensity);
        }).min(0);

        lightBakingFolder.add(lightBakingConfig, 'lightAttenuation').name("Light Attenuation").onChange(function () {
            lightBakingConfig.runParams.lightAttenuation = lightBakingConfig.lightAttenuation;
        });

        lightBakingFolder.add(lightBakingConfig, 'postProcessingFilter', THREE.LightBaking.FilterEnum).name("ImageProcessing").onChange(function () {
            lightBakingConfig.runParams.postProcessingFilter = lightBakingConfig.postProcessingFilter;
        });

        // Path Tracing FOLDER
        var ptFolder = lightBakingFolder.addFolder('Path Tracing');
        ptFolder.open();

        ptFolder.add(lightBakingConfig, 'samples').name("Samples").onChange(function () {
            lightBakingConfig.runParams.samples = parseInt(lightBakingConfig.samples, 10);
        }).min(0).step(1);

        ptFolder.add(lightBakingConfig, 'pathTracingRecLevel').name("Recursion depth").onChange(function () {
            lightBakingConfig.runParams.pathTracingRecLevel = parseInt(lightBakingConfig.pathTracingRecLevel,10);
        }).min(0).step(1);

        // SoftShadows
        var ssFolder = lightBakingFolder.addFolder('Soft shadows');
        ssFolder.close();

        ssFolder.add(lightBakingConfig, 'softShadows').name("Enabled").onChange(function () {
            lightBakingConfig.runParams.softShadows = lightBakingConfig.softShadows;
        });

        ssFolder.add(lightBakingConfig, 'softShadowSamples').name("Samples").onChange(function () {
            lightBakingConfig.runParams.softShadowSamples = parseInt(lightBakingConfig.softShadowSamples,10);
        }).min(0).step(1);

        ssFolder.add(lightBakingConfig, 'softShadowIntensity').name("Intensity Factor").onChange(function () {
            lightBakingConfig.runParams.softShadowIntensity = parseFloat(lightBakingConfig.softShadowIntensity);
        }).min(0).step(1);

        // UV FOLDER
        var uvFolder = lightBakingFolder.addFolder('UV related');
        uvFolder.close();

        uvFolder.add(lightBakingConfig, 'uvMethod', THREE.LightBaking.UVMethodEnum).name("UV-Method").onChange(function () {
            lightBakingConfig.runParams.uvMethod = parseInt(lightBakingConfig.uvMethod,10);
        });

        uvFolder.add(lightBakingConfig, 'packingOffset').name("Packing-Offset").onChange(function () {
            lightBakingConfig.runParams.packingOffset = parseFloat(lightBakingConfig.packingOffset);
        }).min(0).step(1);

        uvFolder.add(lightBakingConfig, 'uvSmoothing').name("Smoothing").onChange(function () {
            lightBakingConfig.runParams.uvSmoothing = parseFloat(lightBakingConfig.uvSmoothing);
        }).step(0.01);


        return getRunParams;

    })();

    // --- Tracker
    // bottom container
    var container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.bottom = '0';
    container.style.width = '100%';
    container.style.textAlign = 'center';
    document.body.appendChild(container);

    // tracker

    tracker = document.createElement('div');
    tracker.style.width = '100%';
    tracker.style.padding = '10px';
    tracker.style.background = '#d3d3d3';
    container.appendChild(tracker);

    function handleFiles(evt) {
        var objectURL = window.URL.createObjectURL(evt[0]);
        importScene(objectURL);
    }

    tracker.innerHTML = (function () {
        var startMsg = "<a onclick=\"bakeScene()\" href=\"#\">Start baking!<\a>";
        var downloadMsg = "<input type=\"file\" id=\"fileElem\" multiple accept=\"zip/*\" style=\"display:none\" onchange=\"lightBakingDemo.handleFiles(this.files)\" single>" +
            "<a href=\"#\" id=\"fileSelect\">Select lightmap files</a>";

        return startMsg + " - " + downloadMsg;
    })();

    (function () {

        var fileSelect = document.getElementById("fileSelect"),
            fileElem = document.getElementById("fileElem");

        fileSelect.addEventListener("click", function (e) {
            if (fileElem) {
                fileElem.click();
            }
            e.preventDefault(); // prevent navigation to "#"
        }, false);

    })();

    // --- Import a scene
    function importScene(url) {

        var lightBaking = THREE.LightBaking({scene: scene});
        lightBaking.importLightMaps(url, function () {
            render();
            render();
        });
    }

    // --- Lightbaking
    function lightBakingRun() {

        var baked = 0;
        var toBake = lightBaking.getMeshesToBakeCount();
        var tt0 = Date.now();

        tracker.innerHTML = "Started baking for " + toBake + " Meshes.";

        function getMsg() {

            return (baked === toBake ? baked : ++baked) + "/" + toBake + " Meshes baked";

        }

        lightBaking.setOnMeshBaked(function () {

            var msg = getMsg();

            tracker.innerHTML = msg;

            lightBaking.log("setOnMeshBaked() called - & calling render()");
            render();
            render();

        });

        lightBaking.setAfterExecuted(function () {

            var timeMsg = " - " + ((Date.now() - tt0) / 1000) + "s";
            var previewMsg = "<a onclick=\"lightBaking.debugLightMaps()\" href=\"#\">Display Lightmaps<\a>";
            var downloadMsg = "<a onclick=\"lightBaking.exportLightMaps()\" href=\"#\">Export Lightmaps<\a>";
            var resetCamMsg = "<a onclick=\"controls.reset()\" href=\"#\">Reset Camera<\a>";
            var msg = getMsg() + timeMsg + " - " + previewMsg + " - " + downloadMsg + " - " + resetCamMsg;

            tracker.innerHTML = msg;

        });

    }

    // --- What to expose
    return {
        lightBakingRun: lightBakingRun,
        handleFiles: handleFiles,
        getRunParams: runConfig
    };

};
