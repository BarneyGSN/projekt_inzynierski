
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { Deck } from '@deck.gl/core';
import { LineLayer, ScatterplotLayer } from '@deck.gl/layers';

Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIwZGI0MGFiOS1jZmZiLTQxMDMtYmI4Yi02ZTg1ZGI0MjgxYzYiLCJpZCI6NDIzNzU1LCJpYXQiOjE3NzcyMDYwNTR9.-6Mf9nmT3ItEZ0-6Ey1rv6mUgjrQceH84DyWZnnzT4A';

const viewer = new Cesium.Viewer('cesiumContainer', {
    infoBox: false,
    selectionIndicator: false,
    animation: false,
    clock: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false
});

viewer.scene.skyBox = undefined;
viewer.scene.skyAtmosphere = undefined;
viewer.scene.globe.show = true;
viewer.scene.globe.baseColor = Cesium.Color.TRANSPARENT;
viewer.scene.globe.undergroundColor = Cesium.Color.TRANSPARENT;
viewer.scene.imageryLayers.removeAll();
viewer.scene.screenSpaceCameraController.zoomFactor = 0.8;
viewer.scene.screenSpaceCameraController.inertiaZoom = 0.5;
viewer.scene.backgroundColor = Cesium.Color.BLACK;
viewer.scene.logarithmicDepthBuffer = true;

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
    return gridData;
};

const ply_file = "/T_II_73_d3.ply";

let deckGlLayer = null;

// =========================================================================
// GausLayer — rozszerzenie ScatterplotLayer o skalę/rotację gaussianów
// =========================================================================
class GausLayer extends ScatterplotLayer {
    getShaders() {
        const shaders = super.getShaders();
        return {
            ...shaders,
            inject: {
                'vs:#decl': `
                    in vec3 instanceScales;
                    in vec4 instanceRotations;
                `,
                'vs:DECKGL_FILTER_SIZE': `
                    vec4 q = instanceRotations;

                    // transpose() bo GLSL buduje mat3 kolumnami, nie wierszami
                    mat3 R = transpose(mat3(
                        1.0 - 2.0 * (q.y * q.y + q.z * q.z),  2.0 * (q.x * q.y - q.z * q.w),        2.0 * (q.x * q.z + q.y * q.w),
                        2.0 * (q.x * q.y + q.z * q.w),        1.0 - 2.0 * (q.x * q.x + q.z * q.z),  2.0 * (q.y * q.z - q.x * q.w),
                        2.0 * (q.x * q.z - q.y * q.w),        2.0 * (q.y * q.z + q.x * q.w),        1.0 - 2.0 * (q.x * q.x + q.y * q.y)
                    ));

                    vec3 rotatedSize = R * (size * instanceScales);

                    // Permutacja osi: PLY (x,y,z) -> ENU (x, z, -y)
                    size = vec3(rotatedSize.x, rotatedSize.z, -rotatedSize.y);
                `
            }
        };
    }

    initializeState() {
        super.initializeState();
        this.getAttributeManager().addInstanced({
            instanceScales: {size: 3, accessor: 'getInstanceScales'},
            instanceRotations: {size: 4, accessor: 'getInstanceRotations'}
        });
    }
}
GausLayer.layerName = 'GausLayer';

fetch(ply_file)
    .then(res => {
        if (!res.ok) throw new Error("Nie można pobrać pliku PLY");
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

        const propertiesPerVertex = 62;
        const allFloats = new Float32Array(buffer, headerOffset);
        const totalVertices = Math.floor(allFloats.length / propertiesPerVertex);

        const cleanCoords = new Float32Array(totalVertices * 3);
        const direct_color = new Float32Array(totalVertices * 3);
        const opacities = new Float32Array(totalVertices);
        const scale = new Float32Array(totalVertices * 3);
        const rotation = new Float32Array(totalVertices * 4);

        const SH_C0 = 0.28209479177387814;

        // --- Mediana (odporna na floaters) do wyznaczenia prawdziwego środka ---
        const xs = new Float32Array(totalVertices);
        const ys = new Float32Array(totalVertices);
        const zs = new Float32Array(totalVertices);

        for (let i = 0; i < totalVertices; i++) {
            let baseIndex = i * propertiesPerVertex;
            xs[i] = allFloats[baseIndex];
            ys[i] = allFloats[baseIndex + 1];
            zs[i] = allFloats[baseIndex + 2];
        }

        const median = (arr) => {
            const sorted = Array.from(arr).sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
        };

        const centerX = median(xs);
        const centerY = median(ys);
        const centerZ = median(zs);

        const MODEL_SCALE_FACTOR = 1.0;
        const OPACITY_THRESHOLD = 0.05; // odfiltrowanie floaterów

        let index_3 = 0;
        let index_4 = 0;

        for (let i = 0; i < totalVertices; i++) {
            let baseIndex = i * propertiesPerVertex;

            let rx = allFloats[baseIndex];
            let ry = allFloats[baseIndex + 1];
            let rz = allFloats[baseIndex + 2];

            // Permutacja osi PLY -> ENU: nowe Y = stare Z, nowe Z = -stare Y
            cleanCoords[index_3]     = (rx - centerX) * MODEL_SCALE_FACTOR;
            cleanCoords[index_3 + 1] = (rz - centerZ) * MODEL_SCALE_FACTOR;
            cleanCoords[index_3 + 2] = -(ry - centerY) * MODEL_SCALE_FACTOR;

            let dc_0 = allFloats[baseIndex + 6];
            let dc_1 = allFloats[baseIndex + 7];
            let dc_2 = allFloats[baseIndex + 8];

            direct_color[index_3]     = Math.max(0.0, Math.min(1.0, dc_0 * SH_C0 + 0.5));
            direct_color[index_3 + 1] = Math.max(0.0, Math.min(1.0, dc_1 * SH_C0 + 0.5));
            direct_color[index_3 + 2] = Math.max(0.0, Math.min(1.0, dc_2 * SH_C0 + 0.5));

            let rawOpacity = allFloats[baseIndex + 54];
            opacities[i] = 1.0 / (1.0 + Math.exp(-rawOpacity));

            let s0 = allFloats[baseIndex + 55];
            let s1 = allFloats[baseIndex + 56];
            let s2 = allFloats[baseIndex + 57];

            if (opacities[i] < OPACITY_THRESHOLD) {
                scale[index_3] = 0;
                scale[index_3 + 1] = 0;
                scale[index_3 + 2] = 0;
            } else {
                scale[index_3]     = Math.exp(s0) * MODEL_SCALE_FACTOR;
                scale[index_3 + 1] = Math.exp(s1) * MODEL_SCALE_FACTOR;
                scale[index_3 + 2] = Math.exp(s2) * MODEL_SCALE_FACTOR;
            }

            let rot_w = allFloats[baseIndex + 58];
            let rot_x = allFloats[baseIndex + 59];
            let rot_y = allFloats[baseIndex + 60];
            let rot_z = allFloats[baseIndex + 61];

            let norm = Math.hypot(rot_w, rot_x, rot_y, rot_z) || 1.0;
            rotation[index_4]     = rot_x / norm;
            rotation[index_4 + 1] = rot_y / norm;
            rotation[index_4 + 2] = rot_z / norm;
            rotation[index_4 + 3] = rot_w / norm;

            index_3 += 3;
            index_4 += 4;
        }

        console.log(`Załadowano ${totalVertices} punktów.`);

        deckGlLayer = new Deck({
            canvas: 'deck-container',
            width: '100%',
            height: '100%',
            initialViewState: {
                longitude: centerLon,
                latitude: centerLat,
                zoom: 18,
                pitch: 45,
                bearing: 0,
            },
            controller: false,
            layers: [
                new LineLayer({
                    id: 'white-grid',
                    data: createGridLayer(),
                    getSourcePosition: d => d.from,
                    getTargetPosition: d => d.to,
                    getColor: [255, 255, 255, 220],
                    getWidth: 2,
                    widthUnits: 'pixels'
                }),
                new GausLayer({
                    id: 'custom-gsplat-layer',
                    data: { length: totalVertices },
                    pickable: false,
                    billboard: false,
                    coordinateSystem: 'meter-offsets',
                    coordinateOrigin: [centerLon, centerLat, 0],
                    getPosition: (_, {index}) => [
                        cleanCoords[index * 3],
                        cleanCoords[index * 3 + 1],
                        cleanCoords[index * 3 + 2]
                    ],
                    getFillColor: (_, {index}) => [
                        direct_color[index * 3] * 255,
                        direct_color[index * 3 + 1] * 255,
                        direct_color[index * 3 + 2] * 255,
                        opacities[index] * 255
                    ],
                    getRadius: 1,
                    radiusUnits: 'meters',
                    getInstanceScales: (_, {index}) => [
                        scale[index * 3], scale[index * 3 + 1], scale[index * 3 + 2]
                    ],
                    getInstanceRotations: (_, {index}) => [
                        rotation[index * 4], rotation[index * 4 + 1], rotation[index * 4 + 2], rotation[index * 4 + 3]
                    ],
                    parameters: {
                        blend: true,
                        blendFunc: [0x0302, 0x0303],
                        depthTest: true,
                        depthMask: false
                    }
                })
            ]
        });

        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 100),
            orientation: {
                heading: Cesium.Math.toRadians(0),
                pitch: Cesium.Math.toRadians(-45),
                roll: 0
            },
            duration: 0.5
        });

        viewer.scene.postRender.addEventListener(syncCameras);
        console.log("Model wycentrowany i zmapowany prawidłowo.");
    })
    .catch(error => console.error("Błąd w potoku danych:", error));

const syncCameras = () => {
    const camera = viewer.camera;
    const canvas = viewer.scene.canvas;

    const targetCartesian = viewer.camera.pickEllipsoid(new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2));
    const cartographic = viewer.scene.globe.ellipsoid.cartesianToCartographic(camera.position);

    if (cartographic) {
        const height = cartographic.height;
        const zoom = Math.log2(40075016 / (height * 2)) - 1;

        let targetLng = centerLon;
        let targetLat = centerLat;

        if (targetCartesian) {
            const targetCarto = viewer.scene.globe.ellipsoid.cartesianToCartographic(targetCartesian);
            targetLng = Cesium.Math.toDegrees(targetCarto.longitude);
            targetLat = Cesium.Math.toDegrees(targetCarto.latitude);
        }

        deckGlLayer.setProps({
            viewState: {
                longitude: targetLng,
                latitude: targetLat,
                zoom: Math.max(0, zoom),
                pitch: Cesium.Math.toDegrees(camera.pitch) * -1,
                bearing: Cesium.Math.toDegrees(camera.heading)
            }
        });
    }
};