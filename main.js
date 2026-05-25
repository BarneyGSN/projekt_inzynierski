import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {Deck} from '@deck.gl/core';
import {LineLayer, PointCloudLayer} from '@deck.gl/layers';
import {SimpleMeshLayer} from '@deck.gl/mesh-layers'
import {PLYLoader} from '@loaders.gl/ply';
import {registerLoaders} from '@loaders.gl/core'

registerLoaders(PLYLoader);
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIwZGI0MGFiOS1jZmZiLTQxMDMtYmI4Yi02ZTg1ZGI0MjgxYzYiLCJpZCI6NDIzNzU1LCJpYXQiOjE3NzcyMDYwNTR9.-6Mf9nmT3ItEZ0-6Ey1rv6mUgjrQceH84DyWZnnzT4A';

const viewer = new Cesium.Viewer('cesiumContainer', {
    infoBox: false,
    selectionIndicator: false,
    animation: false,
    clock: false,
    timeline: false,
    baseLayerPicker: false
});

viewer.scene.skyBox = undefined;
viewer.scene.skyAtmosphere = undefined;
viewer.scene.globe.show = false;
viewer.scene.animation
viewer.scene.imageryLayers.removeAll();

const centerLon = 21.01;
const centerLat = 52.22;

const createGridLayer = () => {
    const gridData = [];
    const spacing = 50;
    const linesCount = 40;
    const half = Math.floor(linesCount / 2);
    const scaleFactor = Math.cos((centerLat * Math.PI) / 180)
    const spacingX = spacing / scaleFactor;
    const spacingY = spacing;

    const maxDistX = half * spacingX;
    const maxDistY = half * spacingY;

    for (let i = -half; i <= half; i++) {
        const offsetX = i * spacingX;
        const offsetY = i * spacingY;

        gridData.push({
            from: [-maxDistX, offsetY, 0],
            to: [maxDistX, offsetY, 0]
        });
        gridData.push({
            from: [offsetX, -maxDistY, 0],
            to: [offsetX, maxDistY, 0]
        });
    }
    console.log(gridData);
    return gridData;
};

const ply_file = "/T_II_73_d3.ply"

const deckglLayer = new Deck({
    canvas: 'deck-container',
    width: '100%',
    height: '100%',
    initialViewState: {
        target: [0, 0, 0],
        zoom: 15,
        pitch: 60,
        bearing: 0,
    },
    controller: false,
    parameters: {
        depthTest: true,
        depthMask: true,
    },
    layers: [
        new LineLayer({
            id: 'white-grid',
            data: createGridLayer(),
            coordinateMode: 0,
            coordinateOrigin: [centerLon, centerLat, 0],
            getSourcePosition: d => d.from,
            getTargetPosition: d => d.to,
            getColor: [255, 255, 255, 220],
            getWidth: 2,
            widthUnits: 'pixels'
        }),
        new PointCloudLayer({
            id: 'ply-point-cloud-layer',
            data: ply_file,
            coordinateMode: 0,
            coordinateOrigin: [centerLon, centerLat, 0],
            getPosition: d => d.position,
            getColor: d => [255, 255, 0],
            pointSize: 4,
            loaders: [PLYLoader]
        })
    ]
})

const syncCameras = () => {
    const camera = viewer.camera;
    const cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(camera.position);

    if (cartographic) {
        const height = cartographic.height;
        const zoom = Math.log2(40075016 / (height * 2)) - 1;

        deckglLayer.setProps({
            viewState: {
                target: [0, 0, 0],
                longitude: Cesium.Math.toDegrees(cartographic.longitude),
                latitude: Cesium.Math.toDegrees(cartographic.latitude),
                zoom: zoom,
                pitch: Cesium.Math.toDegrees(camera.pitch) * -1,
                bearing: Cesium.Math.toDegrees(camera.heading)
            }
        })
    }
};

viewer.scene.postRender.addEventListener(syncCameras)

viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 1500),
    orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0
    }

})