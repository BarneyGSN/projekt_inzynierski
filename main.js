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
    const spacingMeters = 50;
    const linesCount = 40;
    const half = Math.floor(linesCount / 2);

    const latRad = (centerLat * Math.PI) / 180;
    const spacingLat = spacingMeters / 111320;
    const spacingLon = spacingMeters / (111320 * Math.cos(latRad));


    for (let i = -half; i <= half; i++) {
        const offsetLon = i * spacingLon;
        const offsetLat = i * spacingLat;

       const maxDistLon = half * spacingLon;
       const maxDistLat = half * spacingLat;
        gridData.push({
            from: [centerLon - maxDistLon, centerLat + offsetLat, 0],
            to: [centerLon + maxDistLon, centerLat + offsetLat, 0]
        });
        gridData.push({
            from: [centerLon + offsetLon, centerLat - maxDistLat, 0],
            to: [centerLon + offsetLon, centerLat + maxDistLat, 0]
        });
    }
    console.log(gridData);
    return gridData;
};

const ply_file = "/T_II_73_d3.ply"

const transformMetersToLngLat = (metresBuffer, centerLon, centerLat) => {
    const metresPerDegreeLat = 111320;
    const latRad = (centerLat * Math.PI) / 180;
    const metresPerDegreeLon = 111320 * Math.cos(latRad);

    const lngLatBuffer = new Float32Array(metresBuffer.length);

    for (let i = 0; i < metresBuffer.length; i += 3) {
        let x = metresBuffer[i];
        let y = metresBuffer[i + 1];
        let z = metresBuffer[i + 2];

        lngLatBuffer[i] = centerLon + (x / metresPerDegreeLon);
        lngLatBuffer[i + 1] = centerLat + (y / metresPerDegreeLat);
        lngLatBuffer[i + 2] = z;
    }
    return lngLatBuffer;
}

let deckGlLayer = null;

fetch(ply_file)
    .then(res => {
        if (!res.ok) {
            throw new Error ("Nie można pobrać pliku PLY")
        }
        return res.arrayBuffer();
    })
    .then(buffer => {
        const bytes = new Uint8Array(buffer);
        const headerText = "end_header";
        let headerOffset = 0;

        for (let i = 0; i < bytes.length - 20; i++) {
            const subArray = bytes.slice(i, i + headerText.length);
            const textChunk = String.fromCharCode.apply(null, Array.from(subArray));
            if (textChunk === headerText) {
                headerOffset = i + headerText.length;
                while (bytes[headerOffset] === 10 || bytes[headerOffset] === 13) {
                    headerOffset++;
                }
                break;
            }
        }

        const allFloats = new Float32Array(buffer, headerOffset);
        const propertiesPerVertex = 17;
        const totalVertices = Math.floor(allFloats.length / propertiesPerVertex);

        const cleanCoords = new Float32Array(totalVertices * 3);
        let coordIndex = 0;

        for (let i = 0; i < allFloats.length; i += propertiesPerVertex) {
            let x = allFloats[i];
            let y = allFloats[i + 1];
            let z = allFloats[i + 2];

            cleanCoords[coordIndex] = x;
            cleanCoords[coordIndex + 1] = y;
            cleanCoords[coordIndex + 2] = z;

            coordIndex += 3;
        }
        const lngLatData = transformMetersToLngLat(cleanCoords, centerLon, centerLat);

        deckGlLayer = new Deck({
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
                    data: {
                        length: lngLatData.length / 3,
                        attributes: {
                            getPosition:  {value: lngLatData, size: 3}
                        }
                    },
                    coordinateMode: 1,
                    coordinateOrigin: [centerLon, centerLat, 0],
                    getColor: d => [255, 255, 0],
                    pointSize: 4,
                    loaders: [PLYLoader]
                })
            ]
        });
        viewer.scene.postRender.addEventListener(syncCameras);
        console.log("Scena została zainizjalizowana pomyślnie.");
    })
    .catch(error => console.log("Błąd w potoku danych:", error));

const syncCameras = () => {
    const camera = viewer.camera;
    const cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(camera.position);

    if (cartographic) {
        const height = cartographic.height;
        const zoom = Math.log2(40075016 / (height * 2)) - 1;

        deckGlLayer.setProps({
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


viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 1500),
    orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0
    }

})