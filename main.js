import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import { buildPlySubset, filterNoisyVertices, parsePly, plyBufferToBlobUrl } from './plyutils.js';
import './src/ui/lowerBar.js';
import './src/ui/importBox.js';
import './src/ui/FileList';
import {setupLayerManager, registerLayer, removeLayer} from "./deleteFile";

Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIwZGI0MGFiOS1jZmZiLTQxMDMtYmI4Yi02ZTg1ZGI0MjgxYzYiLCJpZCI6NDIzNzU1LCJpYXQiOjE3NzcyMDYwNTR9.-6Mf9nmT3ItEZ0-6Ey1rv6mUgjrQceH84DyWZnnzT4A';

const viewer = new Cesium.Viewer('cesiumContainer', {
    infoBox: false,
    selectionIndicator: false,
    animation: false,
    clock: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    fullscreenButton: false,
    creditContainer: document.createElement('none'),
    homeButton: false,
    navigationHelpButton: false,
    sceneModePicker: false
});

viewer.scene.skyBox = undefined;
viewer.scene.skyAtmosphere = undefined;
viewer.scene.globe.show = false;
viewer.scene.backgroundColor = Cesium.Color.BLACK;

const centerLon = 21.01;
const centerLat = 52.22;
const ply_file = "/T_II_73_d3.ply";

const threeCanvas = document.getElementById('three-container');
const threeRenderer = new THREE.WebGLRenderer({ canvas: threeCanvas, alpha: true, antialias: true });
threeRenderer.setSize(window.innerWidth, window.innerHeight);

const threeScene = new THREE.Scene();
const threeCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);

const gridHelper = new THREE.GridHelper(2000, 40, 0xffffff, 0xffffff);
threeScene.add(gridHelper);

const splatViewer = new GaussianSplats3D.Viewer({
    scene: threeScene,
    camera: threeCamera,
    renderer: threeRenderer,
    selfDrivenMode: false,
    useBuiltInControls: false,
    sharedMemoryForWorkers: false
});

const lBarUI = document.querySelector('lower-bar');
const fileListEl = document.querySelector('file-list');
if(fileListEl) {
    setupLayerManager(fileListEl, splatViewer, threeScene);
}

async function loadCleanedSplatScene(source) {
    let buffer;

    const fileName = source instanceof File ? source.name : source.split('/').pop();

    if (source instanceof File) {
        buffer = await source.arrayBuffer();
    } else {
        const res = await fetch(source);
        if (!res.ok) throw new Error ("Nie można pobrać pliku PLY")
        buffer = await res.arrayBuffer();
    }

    const { allFloats, totalVertices, indices, headerText } = parsePly(buffer);

    const keptIndices = filterNoisyVertices(allFloats, totalVertices, indices, {
        opacityThreshold: 0.02,
        maxScaleFactor: 8,
        maxDistanceFactor: Infinity
    });

    const cleanedBuffer = buildPlySubset(allFloats, keptIndices, indices.stride, headerText);
    const blobUrl = plyBufferToBlobUrl(cleanedBuffer);
    const sceneIndex = splatViewer.splatMesh ? splatViewer.splatMesh.scenes.length : 0;
    await splatViewer.addSplatScene(blobUrl, {
        format: GaussianSplats3D.SceneFormat.Ply,
        splatAlphaRemovalThreshold: 1,
        maxScreenSpaceSplatSize: 32,
        position: [0, 0, 0],
        rotation: [1, 0, 0, 0],
        scale: [1, 1, 1]
    });

    if (fileListEl) {
        registerLayer({
            id: Date.now(),
            name: fileName,
            blobUrl: blobUrl,
            mesh: sceneIndex
        }, fileListEl);

    }

    URL.revokeObjectURL(blobUrl);
    console.log("Oczyszczona scena splatów załadowana");

    if (lBarUI) {
        lBarUI.pointCount = keptIndices.length;
    }
}

const importUI = document.querySelector('import-box');
if (importUI) {
    importUI.addEventListener('file-loaded', async(e) => {
        const file = e.detail.file;

        loadCleanedSplatScene(file).catch(err => console.error('Błąd ładowania/oczyszczania PLY', err));
    })
}

const syncCameras = () => {
    const camera = viewer.camera;

    const originCartesian = Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 0);
    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(originCartesian);
    const inverseTransform = Cesium.Matrix4.inverse(transform, new Cesium.Matrix4());

    const camPosLocal = Cesium.Matrix4.multiplyByPoint(inverseTransform, camera.positionWC, new Cesium.Cartesian3());
    threeCamera.position.set(camPosLocal.x, camPosLocal.z, -camPosLocal.y);

    const upCartesian = Cesium.Cartesian3.add(camera.positionWC, camera.upWC, new Cesium.Cartesian3());
    const upLocal = Cesium.Matrix4.multiplyByPoint(inverseTransform, upCartesian, new Cesium.Cartesian3());
    threeCamera.up.set(upLocal.x - camPosLocal.x, upLocal.z - camPosLocal.z, -(upLocal.y - camPosLocal.y)).normalize();

    const dirCartesian = Cesium.Cartesian3.add(camera.positionWC, camera.directionWC, new Cesium.Cartesian3());
    const dirLocal = Cesium.Matrix4.multiplyByPoint(inverseTransform, dirCartesian, new Cesium.Cartesian3());
    threeCamera.lookAt(dirLocal.x, dirLocal.z, -dirLocal.y);

    threeCamera.fov = Cesium.Math.toDegrees(viewer.camera.frustum.fovy || 1.0);
    threeCamera.updateProjectionMatrix();

    splatViewer.update();
    splatViewer.render();
};

viewer.scene.postRender.addEventListener(syncCameras);

viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 100),
    orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0
    }
});

if (lBarUI) {
    lBarUI.addEventListener('reset-camera', () => {
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 100),
            orientation: {
                heading: Cesium.Math.toRadians(0),
                pitch: Cesium.Math.toRadians(-45),
                roll: 0
            },
            duration: 1.5
        });
    });
}