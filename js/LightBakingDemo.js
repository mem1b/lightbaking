/**
 * Created by Jan Pascal Tschudy on 17.08.2015.
 */

var lightBakingDemo = (function () {
    var tracker;
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
        console.log(objectURL);

        importScene(objectURL);

        /* now you can work with the file list */
    }

    tracker.innerHTML = (function () {
        var startMsg = "<a onclick=\"bakeScene()\" href=\"#\">Start baking!<\a>";
        var downloadMsg = "<input type=\"file\" id=\"fileElem\" multiple accept=\"zip/*\" style=\"display:none\" onchange=\"lightBakingDemo.handleFiles(this.files)\" single>" +
            "<a href=\"#\" id=\"fileSelect\">Select some files</a>";

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


    function importScene(url) {

        var lightBaking = THREE.LightBaking({scene: scene});
        lightBaking.importLightMaps(url, function () {
            render();
            render();
        });
    }


    function lightBakingRun() {

        var baked = 0;
        var toBake = lightBaking.getMeshesToBakeCount();
        var tt0 = Date.now();

        tracker.innerHTML = "Start baking for " + toBake + " Meshes.";

        function getMsg() {

            return baked === toBake ? (baked + "/" + toBake + " Meshes baked - Done") : (++baked + "/" + toBake + " Meshes baked");

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
            var msg = getMsg() + timeMsg + " - " + previewMsg + " - " + downloadMsg;

            tracker.innerHTML = msg;

        });

    }

    return {
        lightBakingRun: lightBakingRun,
        handleFiles: handleFiles
    };

})();
