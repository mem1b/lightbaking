/**
 * @author mrdoob / http://mrdoob.com/
 */

Sidebar.LightBaking = function ( editor ) {


    function addSelectOptions( params ) {
        var options = {};
        var key;

        for ( key in params.types ) {

            options[ key ] = key;

        }

        var rowPanel = new UI.Panel();
        var selops = new UI.Select().setOptions( options ).setWidth( params.selopWidth ).onChange( function () {

            editor.config.setKey( params.path, this.getValue() );
            updateRenderer();

        } );

        rowPanel.add( new UI.Text( params.uiText ).setWidth( params.uiWidth ) );
        rowPanel.add( selops );

        container.add( rowPanel );

        if ( editor.config.getKey( params.path ) !== undefined ) {

            selops.setValue( editor.config.getKey( params.path ) );

        } else {

            editor.config.setKey( params.path, params.default );

        }

    }

    var signals = editor.signals;


    var container = new UI.CollapsiblePanel();
    container.setCollapsed( editor.config.getKey( 'ui/sidebar/project/collapsed' ) );
    container.onCollapsedChange( function ( boolean ) {

        editor.config.setKey( 'ui/sidebar/project/collapsed', boolean );

    } );

    container.addStatic( new UI.Text( 'LIGHT BAKING' ) );
    container.add( new UI.Break() );

    var appModeTypes = {
        'Single Thread': THREE.cLightBaking.ApplicationExecutionEnum.SINGLETHREADED,
        'Asynchronous': THREE.cLightBaking.ApplicationExecutionEnum.SINGLETHREADED,
        'Multi Threaded': THREE.cLightBaking.ApplicationExecutionEnum.MULTITHREADED
    };

    var bakingMethodTypes = {
        'Path Tracing': THREE.cLightBaking.BakingMethodEnum.PATHTRACING,
        'Two Pass Method': THREE.cLightBaking.BakingMethodEnum.TWOPASS,
    };

    var shadingTypes = {
        'Flat': THREE.cLightBaking.ShadingEnum.FLAT,
        'Phong': THREE.cLightBaking.ShadingEnum.PHONG,
        'FlatFastMethod': THREE.cLightBaking.ShadingEnum.FLATFAST,
    };

    var softshadowTypes = {
        'false': false,
        'true': true,
    };

    var uvMethodTypes = {
        'Uniform': THREE.cLightBaking.UVMethodEnum.UNIFORMCENTERED,
        'Packed': THREE.cLightBaking.UVMethodEnum.PACKED,
    };

    var filterTypes = {
        'None': THREE.cLightBaking.FilterEnum.NONE,
        'Gauss': THREE.cLightBaking.FilterEnum.GAUSS,
        'Box': THREE.cLightBaking.FilterEnum.BOX,
    };

    addSelectOptions( {
        path: 'lightbaking/appMode',
        types: appModeTypes,
        default: "Multi Threaded",
        selopWidth: '100px',
        uiText: 'Execution Model',
        uiWidth: '150px'
    } );

    // TextureSize
    var textureSizeRow = new UI.Panel();
    var textureSize = new UI.Input().setWidth( '100px' ).setFontSize( '12px' ).onChange( function () {

        editor.config.setKey( 'lightbaking/textureSize', this.getValue() );

    } );

    if ( textureSize.getValue() === "undefined" ) {

        var textureSizeStored = editor.config.getKey( 'lightbaking/textureSize' );
        textureSize.setValue( textureSizeStored !== undefined ? textureSizeStored : 512 );

    }

    textureSizeRow.add( new UI.Text( 'Texturesize' ).setWidth( '150px' ) );
    textureSizeRow.add( textureSize );

    container.add( textureSizeRow );

    // Samples
    var samplesNameRow = new UI.Panel();
    var samples = new UI.Input().setWidth( '100px' ).setFontSize( '12px' ).onChange( function () {

        editor.config.setKey( 'lightbaking/samples', this.getValue() );

    } );

    if ( samples.getValue() === "undefined" ) {

        var samplesStored = editor.config.getKey( 'lightbaking/samples' );
        samples.setValue( samplesStored !== undefined ? samplesStored : 2 );

    }

    samplesNameRow.add( new UI.Text( 'Samples' ).setWidth( '150px' ) );
    samplesNameRow.add( samples );

    container.add( samplesNameRow );

    // recursionLevel
    var recursionLevelRow = new UI.Panel();
    var recursionLevel = new UI.Input().setWidth( '100px' ).setFontSize( '12px' ).onChange( function () {

        editor.config.setKey( 'lightbaking/recursionLevel', this.getValue() );

    } );

    if ( recursionLevel.getValue() === "undefined" ) {

        var recursionLevelStored = editor.config.getKey( 'lightbaking/recursionLevel' );
        recursionLevel.setValue( recursionLevelStored !== undefined ? recursionLevelStored : 2 );

    }

    recursionLevelRow.add( new UI.Text( 'Recursion level' ).setWidth( '150px' ) );
    recursionLevelRow.add( recursionLevel );

    container.add( recursionLevelRow );


    addSelectOptions( {
        path: 'lightbaking/shading',
        types: shadingTypes,
        default: "Flat",
        selopWidth: '100px',
        uiText: 'Interpolation',
        uiWidth: '150px'
    } );

    addSelectOptions( {
        path: 'lightbaking/softshadows',
        types: softshadowTypes,
        default: "Flat",
        selopWidth: '100px',
        uiText: 'Softshadows',
        uiWidth: '150px'
    } );

    addSelectOptions( {
        path: 'lightbaking/uvMethod',
        types: uvMethodTypes,
        default: "Packed",
        selopWidth: '100px',
        uiText: 'UV Method',
        uiWidth: '150px'
    } );

    addSelectOptions( {
        path: 'lightbaking/filter',
        types: filterTypes,
        default: "None",
        selopWidth: '100px',
        uiText: 'IP-Filter',
        uiWidth: '150px'
    } );


    var runButton = new UI.Button().setLabel( 'Run' ).onClick( function () {

        debugger;

        var params = {};

        var textureSizeP = editor.config.getKey( 'lightbaking/textureSize' );

        params.resetUserData = true;
        params.debugText = true;
        params.workerSource = "../../js/LightBakingWorker.js";
        params.appMode = appModeTypes[ editor.config.getKey( 'lightbaking/appMode' ) ];
        params.samples = editor.config.getKey( 'lightbaking/samples' );
        params.pathTracingRecLevel = editor.config.getKey( 'lightbaking/recursionLevel' );
        params.giIntensity = 2;
        params.shading = shadingTypes[ editor.config.getKey( 'lightbaking/shading' ) ];
        params.softShadows = softshadowTypes[ editor.config.getKey( 'lightbaking/softshadows' ) ];
        params.postProcessingFilter = filterTypes[ editor.config.getKey( 'lightbaking/filter' ) ];
        params.textureWidth = textureSizeP;
        params.textureHeight = textureSizeP;
        params.uvMethod = uvMethodTypes[ editor.config.getKey( 'lightbaking/uvMethod' ) ];
        params.scene = editor.scene;

        var lightBaking = new THREE.LightBaking( params );

        document.title = "Baking in Progress.";

        lightBaking.run( function () {

            var baked = 0;

            lightBaking.setOnMeshBaked( function () {

                document.title = "Mesh " + baked++ + " Baked";

            } );

            lightBaking.setAfterExecuted( function () {

                document.title = baked + " Meshes baked.";

            } );

        } );

    } );

    container.add( runButton );

    //

    function updateRenderer() {

        signals.rendererChanged.dispatch( rendererType.getValue(), rendererAntialias.getValue() );

    }

    return container;

};
