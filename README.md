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

## Examples

Live Examples:
* [Cornell Box](https://cdn.rawgit.com/mem1b/lightbaking/master/examples/CornellBox.html)
* [Colored Lights](https://cdn.rawgit.com/mem1b/lightbaking/master/examples/ColoredLights.html)
* [Mailbox](https://cdn.rawgit.com/mem1b/lightbaking/master/examples/Mailbox.html)

Pictures:
* [Cornell Box](http://web.fhnw.ch/technik/projekte/i/bachelor15/tschudy-link/img/cornell_algorithm.png)
* [Cornell Box Ball Lightmap](http://web.fhnw.ch/technik/projekte/i/bachelor15/tschudy-link/img/uvpacking.png)
* [Cornell Box Textures](http://web.fhnw.ch/technik/projekte/i/bachelor15/tschudy-link/img/cornellbox_walltexture.png)
* [Mailbox](http://web.fhnw.ch/technik/projekte/i/bachelor15/tschudy-link/img/mailbox.png)
* [Editor integration](http://web.fhnw.ch/technik/projekte/i/bachelor15/tschudy-link/img/editor.png)
* [Concave Object](http://web.fhnw.ch/technik/projekte/i/bachelor15/tschudy-link/img/concaveObj.png)


## Recommendations
* Webserver eg node.js, phpstorm etc.
* Chrome 44 (Mozilla and IE seems to have some issues while using our workers)

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
```javascript
lightBaking = THREE.LightBaking({
         "scene"": scene,
         "appMode": THREE.LightBaking.ApplicationExecutionEnum.SINGLETHREADED
 )};
```

#### Minimal Config (Multithreaded)
```javascript
lightBaking = THREE.LightBaking({
         "scene"": scene,
         "workerSource": "LightBakingWorker.js", //optional, only used if multithreading is enabled. Set the source of the LightBakingWorker.js file.
 )};
```

#### Parameter description
All Parameters are listed with their default values.

```javascript
lightBaking = THREE.LightBaking( {

         // Scene Information
         // pass the scene object to the LightBaking plugin
         "scene"": scene

         // Application Execution Model
         // Runs the application in the desired mode.
         // - SINGLETHREADED: Everything is done in the main(ui)thread
         // - ASYNC: Executed asynchronously(not really different to SINGLETHREADED)
         // - MULTITHREADED: Using dedicated WebWorkers
         "appMode": THREE.LightBaking.ApplicationExecutionEnum.MULTITHREADED,

         // (dedicated) Web Worker
         // - workerSource:  only used if multithreading is enabled. Set the source of the LightBakingWorker.js file.
         // - workerLimit: Maximal amount of worker
         "workerSource": "js/LightBakingWorker.js",
         "workerLimit": navigator.hardwareConcurrency,

         // Debugging
         // only used for developing purposes
         // - debugText: get some insight which method was called
         // - debugLightmap: same functionality as debugLightmaps() on THREE.LightBaking
         "debugText": false,
         "debugLightmap": false,
         "debugVisual": false,
         "debugVisualMeshNbr": 0,
         "debugVisualProbabilityFilter": 0.005,
         "debugVisualIsSelectedMesh": false
         "debugVisualRT": false,

         // Lightmap size
         // Usually 2^x
         "textureWidth": 512,
         "textureHeight": 512,

         // Shading Techniques
         // - PHONG
         // - FLAT
         // - FLATFAST (color determined by face vertices, and the whole face gets this color)
         "shading": THREE.LightBaking.ShadingEnum.PHONG,

         // Illumination Models
         // Only Lambertian. Phong doesn't make sense in terms of lightbaking.
         // - LAMBERT
         "illuminationModel": THREE.LightBaking.IlluminationModelEnum.LAMBERT,

         // UV related
         // - uvMethod: optional, 0 - first try, 1 - simple centered, 2 - bin packing approach
         // - packingOffset: optional, offset in pixels for the UV map
         // - uvSmoothing: optional, offset in percent for the inTriangle test used in baking
         "uvMethod": THREE.LightBaking.UVMethodEnum.PACKED,
         "packingOffset": 2,
         "uvSmoothing": 0.2,

         // Light Baking algorithms
         // used for baking TWOPASS/PATHTRACING
         "bakingMethod": THREE.LightBaking.BakingMethodEnum.PATHTRACING,

         // TwoPass Method
         // - twoPassCount: 1 - only direct light, 2 with indirect light
         //   (more passes not possible)
         "twoPassPassCount": 2,

         // PathTracing Method (minimum settings(only direct light))
         // - sampels: samples per lumel
         // - pathTracingRecLevel: max recursion depth
         "samples": 1,
         "pathTracingRecLevel": 0,

         // Ray direction
         // how to integrate over the hemisphere
         // direction for the rays [0-1],
         //   0: only in normal direction
         //   1: 180° direction(ideal diffuse)
         "importanceValue":1,

         // specificMeshBaking
         // Enable/disable specific baking
         // - ENABLED = default(bake all)
         // - DISABLED = bake all which have userDate.baking.bakeMe === true(bake only these)
         // - INVERTED = bakeMe===True ignores these to bake)
         "specificMeshBaking": THREE.LightBaking.SpecificMeshBakingEnum.DISABLED,

         // specificRayCasting
         //optional used for enable/disable ignoring objects,
         // - ENABLED = default(raycast all)
         // - DISABLED = bake all which have userDate.baking.intersectMe === true(use only these fot intersection tests)
         // - INVERTED = intersectMe===True ignores these to intersect)
         "specificRayCasting": THREE.LightBaking.SpecificRayCastingEnum.DISABLED,

         // Raycasting
         // - raycasterImplementation: choose between threejs raycaster implementation and octree(threejs preferred atm!)
         // - raycasterPrecision: set the raycaster precision. the lower the more precise
         "raycasterImplementation": THREE.LightBaking.RayCasterEnum.THREEJS,
         "raycasterPrecision": 0.0001,

         // softshadows
         // - softShadows: enable/disable soft shadows
         // - softShadowSamples: number of shadow samples fot the TWOPASS method.
         // - softShadowIntensity: used in direct light calculation, higher intensity results in brighter values
         "softShadows": true,
         "softShadowSamples": 1,
         "softShadowIntensity": 1,

         // giIntensity
         // increase it to boost the brightness of the indirect rays
         "giIntensity": 2,

         // lightAttenuation
         // - turn the light Attenuation for point lights on/off. Attenuation is derives from the standard point light attributes
         "lightAttenuation": false,

         // Lightmaps post processing:
         // applies an image processing filter onto the lightmap
         // postProcessingFilter: NONE/BOX/GAUSS, used to soften the lightmaps
         "postProcessingFilter": THREE.LightBaking.FilterEnum.NONE,

} );
```

#### Most common parameters:
* to get a smooth/flat shading use: shading & ShadingEnum.Flat or ShadingEnum.PHONG
* to get rid of seams use: packingOffset and/or uvSmoothing and set a higher texture width/height
* to get indirect lighting use: samples > 0 rec level > 1
* to get softshadows use: softshadows: true
* to achieve a brighter lightmap: set giIntensity >= 2
* to improve the pathtracing quality: the more samples the better the quality

#### Import Scene
```javascript
var lightBaking = THREE.LightBaking( { scene: scene } );
lightBaking.importLightMaps( "baked/Mailbox.zip" );
```
#### Export Scene
From developer Console:
```javascript
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
