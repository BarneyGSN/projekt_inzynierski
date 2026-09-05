// plyUtils.js
// Narzędzia do pracy z surowymi danymi 3D Gaussian Splatting w formacie PLY.
// Layout: 62 floaty na wierzchołek:
//   [0-2]   pozycja x,y,z
//   [3-5]   normalna nx,ny,nz
//   [6-8]   DC harmoniki sferycznej (kolor bazowy)
//   [9-53]  pozostałe współczynniki SH (45 wartości)
//   [54]    opacity (przed sigmoidem)
//   [55-57] log-scale x,y,z
//   [58-61] rotacja: qw,qx,qy,qz

export const PROPERTIES_PER_VERTEX = 62;

export function parsePly(buffer) {
    const bytes = new Uint8Array(buffer);
    const headerMarker = "end_header";
    let headerOffset = 0;
    let headerEndIndex = 0;

    for (let i = 0; i < bytes.length - headerMarker.length; i++) {
        const chunk = String.fromCharCode.apply(null, Array.from(bytes.slice(i, i + headerMarker.length)));
        if (chunk === headerMarker) {
            headerEndIndex = i + headerMarker.length;
            headerOffset = headerEndIndex;
            while (bytes[headerOffset] === 10 || bytes[headerOffset] === 13) headerOffset++;
            break;
        }
    }

    const allFloats = new Float32Array(buffer, headerOffset);
    const totalVertices = Math.floor(allFloats.length / PROPERTIES_PER_VERTEX);

    return { allFloats, totalVertices };
}

function median(arr) {
    const sorted = Array.from(arr).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Zwraca listę indeksów wierzchołków uznanych za "dobre" (bez szumu/artefaktów).
 * Odrzuca: zbyt niską opacity, nietypowo dużą skalę ("igły"), nietypowo dużą
 * odległość od mediany pozycji (odosobnione floaters).
 */
export function filterNoisyVertices(allFloats, totalVertices, opts = {}) {
    const {
        opacityThreshold = 0.05,
        maxScaleFactor = 8,
        maxDistanceFactor = 6
    } = opts;

    const opacities = new Float32Array(totalVertices);
    const maxScales = new Float32Array(totalVertices);
    const xs = new Float32Array(totalVertices);
    const ys = new Float32Array(totalVertices);
    const zs = new Float32Array(totalVertices);

    for (let i = 0; i < totalVertices; i++) {
        const base = i * PROPERTIES_PER_VERTEX;
        opacities[i] = 1.0 / (1.0 + Math.exp(-allFloats[base + 54]));
        const s0 = Math.exp(allFloats[base + 55]);
        const s1 = Math.exp(allFloats[base + 56]);
        const s2 = Math.exp(allFloats[base + 57]);
        maxScales[i] = Math.max(s0, s1, s2);
        xs[i] = allFloats[base];
        ys[i] = allFloats[base + 1];
        zs[i] = allFloats[base + 2];
    }

    const centerX = median(xs);
    const centerY = median(ys);
    const centerZ = median(zs);

    const distances = new Float32Array(totalVertices);
    for (let i = 0; i < totalVertices; i++) {
        const dx = xs[i] - centerX;
        const dy = ys[i] - centerY;
        const dz = zs[i] - centerZ;
        distances[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    const scaleLimit = median(maxScales) * maxScaleFactor;
    const distanceLimit = median(distances) * maxDistanceFactor;

    const kept = [];
    let rejOpacity = 0, rejScale = 0, rejDistance = 0;

    for (let i = 0; i < totalVertices; i++) {
        if (opacities[i] < opacityThreshold) { rejOpacity++; continue; }
        if (maxScales[i] > scaleLimit) { rejScale++; continue; }
        if (distances[i] > distanceLimit) { rejDistance++; continue; }
        kept.push(i);
    }

    console.log(
        `Czyszczenie PLY: zachowano ${kept.length}/${totalVertices} ` +
        `(odrzucono: opacity=${rejOpacity}, skala=${rejScale}, dystans=${rejDistance})`
    );

    return kept;
}

/**
 * Buduje treść nagłówka PLY i DOPEŁNIA go linią komentarza tak, by całkowita
 * długość nagłówka w bajtach była wielokrotnością 4 — inaczej blok danych
 * binarnych (odczytywany jako Float32Array) zaczynałby się z przesunięciem
 * o 1-3 bajty, co daje losowe/ekstremalne wartości (objaw: "kolorowe linie").
 */
function buildAlignedHeader(count) {
    const bodyWithoutEndHeader =
        `ply\n` +
        `format binary_little_endian 1.0\n` +
        `element vertex ${count}\n` +
        `property float x\nproperty float y\nproperty float z\n` +
        `property float nx\nproperty float ny\nproperty float nz\n` +
        `property float f_dc_0\nproperty float f_dc_1\nproperty float f_dc_2\n` +
        Array.from({ length: 45 }, (_, i) => `property float f_rest_${i}\n`).join('') +
        `property float opacity\n` +
        `property float scale_0\nproperty float scale_1\nproperty float scale_2\n` +
        `property float rot_0\nproperty float rot_1\nproperty float rot_2\nproperty float rot_3\n`;

    const endHeaderLine = `end_header\n`;
    const baseLength = new TextEncoder().encode(bodyWithoutEndHeader + endHeaderLine).length;

    // Minimalna linia komentarza to "comment \n" = 9 bajtów (bez wypełniacza).
    // Dobieramy długość wypełniacza tak, by finalna długość nagłówka była %4===0.
    const minCommentLen = 9;
    const remainder = (baseLength + minCommentLen) % 4;
    const fillerLen = (4 - remainder) % 4;
    const commentLine = `comment ${'x'.repeat(fillerLen)}\n`;

    const fullHeader = bodyWithoutEndHeader + commentLine + endHeaderLine;

    // Weryfikacja — jeśli to kiedykolwiek nie zgra się, chcemy to widzieć w konsoli od razu.
    const finalLength = new TextEncoder().encode(fullHeader).length;
    if (finalLength % 4 !== 0) {
        console.warn('Nagłówek PLY nadal niewyrównany do 4 bajtów! Długość:', finalLength);
    }

    return fullHeader;
}

/** Buduje nowy, poprawny binarny PLY z podzbioru wierzchołków (wskazanych indeksami). */
export function buildPlySubset(allFloats, vertexIndices) {
    const count = vertexIndices.length;

    const header = buildAlignedHeader(count);
    const headerBytes = new TextEncoder().encode(header);
    const dataFloats = new Float32Array(count * PROPERTIES_PER_VERTEX);

    for (let i = 0; i < count; i++) {
        const srcBase = vertexIndices[i] * PROPERTIES_PER_VERTEX;
        const dstBase = i * PROPERTIES_PER_VERTEX;
        dataFloats.set(allFloats.subarray(srcBase, srcBase + PROPERTIES_PER_VERTEX), dstBase);
    }

    const totalBytes = headerBytes.length + dataFloats.byteLength;
    const outBuffer = new ArrayBuffer(totalBytes);
    const outView = new Uint8Array(outBuffer);
    outView.set(headerBytes, 0);
    outView.set(new Uint8Array(dataFloats.buffer), headerBytes.length);

    return outBuffer;
}

export function plyBufferToBlobUrl(arrayBuffer) {
    const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
    return URL.createObjectURL(blob);
}