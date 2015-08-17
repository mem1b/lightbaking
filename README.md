LightBaking.js (r71)
========

#### Light Baking for three.js r71 ####

The aim of this project is to provide light baking functionality for [THREE.js WebGL library](http://mrdoob.github.com/three.js/).
This project handles everything from UV mapping to baking the light for the whole scene with Path Tracing and filter the maps to get a smooth result even with lower resolution maps.

```html
This build is stable for THREE.js r71
```

## Features

* Distortion free UV mapping
* Optimizing UV layout with bin packing from [Code inComplete](http://codeincomplete.com/posts/2011/5/7/bin_packing/)
* Light Baking
* Path Tracing
* Gauss/Box Filter
* Import and Export
* Integration in three.js
* Integration in the [three.js editor](http://threejs.org/editor/)
* Web Worker functionality

## Recommendations
Works best with Google Chrome >=44
(Mozilla and IE seems to have some issues while using our workers)

## Usage
Download the following scripts:
* Mandatory [script](https://github.com/mem1b/lightbaking/tree/master/js/LightBaking.js)
* Optional only for using workers [script](https://github.com/mem1b/lightbaking/tree/master/js/LightBakingWorker.js)
* Optional for import/export [script](https://github.com/Stuk/jszip/blob/master/dist/jszip.min.js)
* Optional for import/export [script](https://github.com/Stuk/jszip-utils/tree/master/dist/jszip-utils.min.js)

Include them in your html after the [THREE.js WebGL library](http://mrdoob.github.com/three.js/).

```html
<script src="three.min.js"></script>
<script src="LightBaking.js"></script>
```

#### Minimal Config (Singlethreaded)
```html
lightBaking = THREE.LightBaking({
         "scene"": scene,
         "appMode": THREE.LightBaking.ApplicationExecutionEnum.SINGLETHREADED
 )};
```

#### Minimal Config (Multithreaded)
```html
lightBaking = THREE.LightBaking({
         "scene"": scene,
         "workerSource": "LightBakingWorker.js", //optional, only used if multithreading is enabled. Set the source of the LightBakingWorker.js file.
 )};
```

#### Initialize (all parameters with default values are listed)

```html
lightBaking = THREE.LightBaking( {
         "scene"": scene  //mandatory
         "debugText": false, //optional,
         "debugLightmap": false, //optional,
         "debugVisual": false, //optional, was only used for developing
         "debugVisualMeshNbr": 0, //optional,was only used for developing
         "debugVisualProbabilityFilter": 0.005, //optional, was only used for developing
         "debugVisualIsSelectedMesh": false, //optional, was only used for developing
         "debugVisualRT": false, //optional, was only used for developing

         "giIntensity": 2, //optional, increase it to boost the brightness of the indirect rays

         "textureWidth": 512, //optional, global width of the lightmaps
         "textureHeight": 512, //optional, global height of the lightmaps

         // Shading Technique
         "shading": THREE.LightBaking.ShadingEnum.PHONG, //optional PHONG, FLAT, FLATFAST

         // Illumination Model
         "illuminationModel": THREE.LightBaking.IlluminationModelEnum.LAMBERT, //optional,LAMBERT  <- for extending with different models

         // UV
         "uvMethod": THREE.LightBaking.UVMethodEnum.PACKED, // optional, 0 - first try, 1 - simple centered, 2 - bin packing approach
         "packingOffset": 2, //optional, offset in pixels for the UV map
         "uvSmoothing": 0.2, //optional, offset in percent for the inTriangle test used in baking

         "bakingMethod": THREE.LightBaking.BakingMethodEnum.LINK, //optional, algorithm used for baking TWOPASS/PATHTRACING


         // TwoPass Method
         "twoPassPassCount": 2,  //optional, number of passes for this method: 1 - direct light, 2-indirect light

         // PathTracing (minimum settings(only direct light))
         "samples": 5, //optional, number of sampels per texel
         "pathTracingRecLevel": 2, //optional, number of max recursions in path tracing

         //ray direction
         "importanceValue":1, //optional, direction for the rays [0-1], 1==180° direction, 0=only in normal direction

         // various
         "specificMeshBaking": THREE.LightBaking.SpecificMeshBakingEnum.DISABLED, //optional used for enable/disable specific baking , ENABLED = default(bake all)  DISABLED = bake all which have userDate.baking.bakeMe = true(bake only these) INVERTED = bakeMe=True ignores these to bake)
         "specificRayCasting": THREE.LightBaking.SpecificRayCastingEnum.DISABLED, //optional used for enable/disable ignoring objects, ENABLED = default(raycast all)  DISABLED = bake all which have userDate.baking.intersectMe = true(use only these fot intersection tests) INVERTED = intersectMe=True ignores these to intersect)


         "raycasterImplementation": THREE.LightBaking.RayCasterEnum.THREEJS,  //optional, THREEJS - use the three.js raycaster for intersection tests  <- for future extensions
         "raycasterPrecision": 0.0001, //optional, set the raycaster precision. the lower the more precise

         // softshadows
         "softShadows": true, //optional, enable/disable soft shadows
         "softShadowSamples": 1, //optional, number of shadow samples fot the TWOPASS method.
         "softShadowIntensity": 1, //optional, used in direct light calculation, higher intensity results in brighter values

         "lightAttenuation": false, //optional, turn the light Attenuation for point lights on/off. Attenuation is derives from the standard point light attributes

         // post processing
         "postProcessingFilter": THREE.LightBaking.FilterEnum.NONE, //optional, NONE/BOX/GAUSS, used to soften the lightmaps

         // worker
         "workerSource": "js/LightBakingWorker.js", //optional, only used if multithreading is enabled. Set the source of the LightBakingWorker.js file.
         "workerLimit": navigator.hardwareConcurrency, //optional, default is the current max value.

         "appMode": THREE.LightBaking.ApplicationExecutionEnum.MULTITHREADED //optional, SINGLETHREADED/ASYNC/MULTITHREADED

} );
```

#### Import Scene
```html
var lightBaking = THREE.LightBaking( { scene: scene } );
lightBaking.importLightMaps( "baked/Mailbox.zip" );
```
#### Export Scene
From developer Console:
```html
lightBaking.exportLightMaps()
```

#### Editor
To add our baking solution to the three.js editor you need to add the [Sidebar.LightBaking.js](https://github.com/mem1b/lightbaking/tree/master/js/Sidebar.LightBaking.js) into the editor/js folder.
In addition, include the following files in the editors index.html:
```html
<script src="LightBaking.js"></script>
<script src="packer.growing.js"></script>
...
<script src="Sidebar.LightBaking.js"></script>
...
```


---

*Copyright (C) 2015 [Dominik Link](https://github.com/paradoxxl/), [Jan Pascal Tschudy](https://github.com/mem1b), [FHNW](http://www.fhnw.ch/)*
*For full license and information, see [LICENSE](https://mem1b.github.com/lightbaking/LICENSE).*