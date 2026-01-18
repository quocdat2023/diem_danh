lucide.createIcons();

// --- GLOBAL STATE ---
let classes = [];
let faceMatcher = null;
let isPreviewing = false;
let previewRequestId = null;

// DOM Elements
const connectorsSvg = document.getElementById("connectors");
const workspace = document.getElementById("workspace");
const classesColumn = document.getElementById("classesColumn");
const addClassBtn = document.getElementById("addClassBtn");
const template = document.getElementById("classCardTemplate");
const trainingEl = document.getElementById("training");
const previewEl = document.getElementById("previewCard");
const trainBtn = document.getElementById("trainBtn");
const progressBar = document.getElementById("progressBar");
const trainStatus = document.getElementById("trainStatus");
const previewVideo = document.getElementById("previewVideo");
const previewCanvas = document.getElementById("previewCanvas");
const previewPlaceholder = document.getElementById("previewPlaceholder");
const togglePreviewBtn = document.getElementById("togglePreview");

// --- INITIALIZATION ---

async function init() {
    // Load Models
    await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/static/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/static/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/static/models')
    ]);
    console.log("Models loaded");

    await loadMatcher();

    // Fetch existing users
    try {
        const res = await fetch('/students'); // Flask route
        const users = await res.json();

        // Users from Flask/FastAPI are [{student_id, name}, ...]
        // We don't get sampleCount or images from this endpoint currently, so we default 0.
        // To get images, we'd need a different endpoint, but for now lets load names.
        if (users.length > 0) {
            users.forEach(u => addClassCard(u.name, 0, u.student_id, []));
        } else {
            addClassCard("Class 1");
        }
    } catch (e) { console.error("Error fetching users:", e); addClassCard("Class 1"); }

    drawConnectors();
    window.addEventListener("resize", drawConnectors);

    togglePreviewBtn.addEventListener('change', (e) => {
        if (e.target.checked) startPreview();
        else stopPreview();
    });
}

init();

// --- SUB-FUNCTIONS ---

function drawConnectors() {
    connectorsSvg.innerHTML = "";
    const ws = workspace.getBoundingClientRect();
    function getRight(el) { const r = el.getBoundingClientRect(); return { x: r.right - ws.left, y: r.top + r.height / 2 - ws.top }; }
    function getLeft(el) { const r = el.getBoundingClientRect(); return { x: r.left - ws.left, y: r.top + r.height / 2 - ws.top }; }

    const trainingTarget = getLeft(trainingEl);
    const previewTarget = getLeft(previewEl);
    const trainingSource = getRight(trainingEl);

    const cards = document.querySelectorAll(".class-card");
    cards.forEach(card => {
        const s = getRight(card);
        connectorsSvg.appendChild(createPath(s, trainingTarget));
    });
    connectorsSvg.appendChild(createPath(trainingSource, previewTarget));
}

function createPath(p1, p2) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const c1 = { x: p1.x + (p2.x - p1.x) / 2, y: p1.y };
    const c2 = { x: p2.x - (p2.x - p1.x) / 2, y: p2.y };
    path.setAttribute("d", `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`);
    return path;
}

addClassBtn.addEventListener('click', () => {
    addClassCard(`Class ${document.querySelectorAll('.class-card').length + 1}`);
});

function addClassCard(name = "New Class", existingCount = 0, dbId = null, existingImages = []) {
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.class-card');
    const nameInput = clone.querySelector('.class-name-input');
    const deleteBtn = clone.querySelector('.delete-class-btn');
    const webcamBtn = clone.querySelector('.webcam-btn');
    const initialView = clone.querySelector('.initial-view');
    const webcamView = clone.querySelector('.webcam-view');
    const video = clone.querySelector('.class-video');
    const recordBtn = clone.querySelector('.record-btn');
    const closeCamBtn = clone.querySelector('.close-webcam-btn');
    const sampleCountEl = clone.querySelector('.sample-count');
    const thumbsContainer = clone.querySelector('.samples-thumbs');


    nameInput.value = name;
    sampleCountEl.innerText = existingCount;
    let samples = [];
    let capturedImages = [];
    let stream = null;
    let recordInterval = null;

    // Display existing images if any
    if (existingImages && existingImages.length > 0) {
        existingImages.forEach(src => {
            const img = document.createElement('img'); img.src = src;
            img.className = "rounded-sm w-full h-10 object-cover";
            thumbsContainer.appendChild(img);
        });
        thumbsContainer.classList.remove('h-0');
        thumbsContainer.style.height = 'auto';
    }

    deleteBtn.addEventListener('click', async () => {
        if (confirm(`Delete ${nameInput.value}?`)) {
            if (dbId) {
                try {
                    await fetch(`/student/${dbId}`, { method: 'DELETE' });
                    await loadMatcher();
                } catch (e) { console.error(e); }
            }
            card.remove();
            drawConnectors();
        }
    });

    webcamBtn.addEventListener('click', async () => {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: {} });
            video.srcObject = stream;
            initialView.classList.add('hidden');
            webcamView.classList.remove('hidden');
        } catch (e) { alert("Camera Error"); }
    });

    closeCamBtn.addEventListener('click', () => {
        if (stream) stream.getTracks().forEach(t => t.stop());
        webcamView.classList.add('hidden');
        initialView.classList.remove('hidden');
    });

    const overlayCanvas = clone.querySelector('canvas');
    // Ensure overlay matches video flip
    if (overlayCanvas) overlayCanvas.style.transform = "scaleX(-1)";

    const record = () => {
        recordBtn.classList.add('bg-red-100', 'text-red-600', 'border-red-300');
        recordInterval = setInterval(async () => {
            const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();

            if (overlayCanvas) {
                const displaySize = { width: video.clientWidth, height: video.clientHeight };
                faceapi.matchDimensions(overlayCanvas, displaySize);
                const ctx = overlayCanvas.getContext('2d');
                ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

                if (detection) {
                    const resizedDetection = faceapi.resizeResults(detection, displaySize);
                    // Manual drawing for custom color
                    const landmarks = resizedDetection.landmarks;
                    const ctx = overlayCanvas.getContext('2d');
                    ctx.fillStyle = '#1967D2';

                    // Draw Points
                    landmarks.positions.forEach(point => {
                        ctx.beginPath();
                        ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
                        ctx.fill();
                    });

                    // Draw Lines
                    ctx.strokeStyle = '#1967D2';
                    ctx.lineWidth = 2;

                    const drawPath = (points, close = false) => {
                        ctx.beginPath();
                        points.forEach((p, i) => {
                            if (i === 0) ctx.moveTo(p.x, p.y);
                            else ctx.lineTo(p.x, p.y);
                        });
                        if (close) ctx.closePath();
                        ctx.stroke();
                    };

                    drawPath(landmarks.getJawOutline());
                    drawPath(landmarks.getLeftEye(), true);
                    drawPath(landmarks.getRightEye(), true);
                    drawPath(landmarks.getNose());
                    drawPath(landmarks.getMouth(), true);
                }
            }

            if (detection) {
                // We don't save descriptors for training anymore, we send images
                // But we keep them here for local count/feedback
                samples.push(Array.from(detection.descriptor));
                sampleCountEl.innerText = existingCount + samples.length;

                // Capture Image less frequently (every 5 frames or so)
                if (samples.length % 5 === 0 || samples.length < 5) {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    const ctx = canvas.getContext('2d');
                    // Draw raw (not mirrored) for better training data usually, or mirrored if you prefer.
                    // Let's keep normal.
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

                    // Save captured image
                    capturedImages.push(dataUrl);

                    // Thumbnail
                    const img = document.createElement('img'); img.src = dataUrl;
                    img.className = "rounded-sm w-full h-10 object-cover";
                    thumbsContainer.appendChild(img);
                    thumbsContainer.classList.remove('h-0');
                    thumbsContainer.style.height = 'auto';
                }
            }
        }, 100);
    };

    const stopRecord = () => {
        clearInterval(recordInterval);
        recordBtn.classList.remove('bg-red-100', 'text-red-600', 'border-red-300');
        if (overlayCanvas) {
            const ctx = overlayCanvas.getContext('2d');
            ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }
    };

    recordBtn.addEventListener('mousedown', record);
    recordBtn.addEventListener('mouseup', stopRecord);
    recordBtn.addEventListener('mouseleave', stopRecord);

    card.getSamples = () => samples;
    card.getImages = () => capturedImages;
    card.getName = () => nameInput.value;
    card.resetSamples = () => { samples = []; capturedImages = []; };

    classesColumn.insertBefore(card, addClassBtn);
    lucide.createIcons();
    drawConnectors();
}

trainBtn.addEventListener('click', async () => {
    const cards = document.querySelectorAll('.class-card');
    if (cards.length === 0) return;

    trainBtn.disabled = true;
    trainStatus.innerText = "Training Models...";
    progressBar.style.width = "20%";
    let uploadedCount = 0;

    for (const card of cards) {
        const name = card.getName();
        const newImages = card.getImages();

        // Skip if no new images
        if (newImages.length > 0) {
            try {
                // Prepare FormData for Backend (Server-side training)
                const formData = new FormData();
                const studentId = name.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now();
                formData.append('student_id', studentId);
                formData.append('name', name);

                // Convert Base64 images to Blobs
                for (let i = 0; i < newImages.length; i++) {
                    const res = await fetch(newImages[i]);
                    const blob = await res.blob();
                    formData.append('image_files', blob, `capture_${i}.jpg`);
                }

                await fetch('/register_student', {
                    method: 'POST',
                    body: formData
                });

                card.resetSamples();
            } catch (e) { console.error(e); }
        }
        uploadedCount++;
        progressBar.style.width = `${20 + (uploadedCount / cards.length * 60)}%`;
    }

    await loadMatcher();
    progressBar.style.width = "100%";
    trainStatus.innerText = "Model Trained!";

    setTimeout(() => {
        trainBtn.disabled = false;
        progressBar.style.width = "0%";
        trainStatus.innerText = "Ready";
        if (!isPreviewing) { togglePreviewBtn.checked = true; startPreview(); }
    }, 1000);
});

async function loadMatcher() {
    try {
        const res = await fetch('/faces'); // Flask proxy to /api/faces
        const faces = await res.json();

        if (faces.length > 0) {
            const labeledFaceDescriptors = faces.map(f => {
                // f.descriptors is array of arrays
                const descriptors = f.descriptors.map(d => new Float32Array(d));
                return new faceapi.LabeledFaceDescriptors(f.label, descriptors);
            });
            faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);
            console.log("Matcher reloaded with " + faces.length + " classes");
        }
    } catch (e) { console.error("Error loading matcher:", e); }
}

// State for Hybrid Approach
let lastPrediction = { name: 'Scanning...', time: 0 };
let isPredicting = false;

async function startPreview() {
    if (isPreviewing) return;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        previewVideo.srcObject = stream;
        previewPlaceholder.classList.add('hidden');
        isPreviewing = true;

        // Start Server Polling Loop
        pollServerForIdentity();

        const loop = async () => {
            if (!isPreviewing) return;

            if (previewVideo.paused || previewVideo.ended) {
                previewRequestId = requestAnimationFrame(loop);
                return;
            }

            const displaySize = {
                width: previewVideo.clientWidth,
                height: previewVideo.clientHeight
            };

            if (
                previewCanvas.width !== displaySize.width ||
                previewCanvas.height !== displaySize.height
            ) {
                faceapi.matchDimensions(previewCanvas, displaySize);
            }

            try {
                // Use TinyFace for fast UI box drawing
                const detections = await faceapi.detectAllFaces(
                    previewVideo,
                    new faceapi.TinyFaceDetectorOptions()
                );

                const resizedDetections = faceapi.resizeResults(
                    detections,
                    displaySize
                );

                const ctx = previewCanvas.getContext('2d');
                ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

                resizedDetections.forEach(d => {
                    const box = d.box;
                    const mirrorX = previewCanvas.width - box.x - box.width;

                    // Use last known server prediction if recent
                    let label = lastPrediction.name;
                    let color = label === 'Scanning...' || label === 'Unknown' ? '#DC2626' : '#2563EB';

                    // Draw Box
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = color;
                    ctx.strokeRect(mirrorX, box.y, box.width, box.height);

                    // Draw Label background
                    ctx.fillStyle = color;
                    ctx.font = '14px Inter';
                    const textWidth = ctx.measureText(label).width + 10;
                    ctx.fillRect(mirrorX, box.y - 22, textWidth, 22);

                    // Draw Text
                    ctx.fillStyle = '#FFF';
                    ctx.fillText(label, mirrorX + 5, box.y - 6);

                    // // Auto Check-in if identified
                    // if (label !== 'Unknown' && label !== 'Scanning...') {
                    //     triggerAttendanceCheckIn(label);
                    // }
                });
            } catch (err) { }

            previewRequestId = requestAnimationFrame(loop);
        };

        loop();
    } catch (e) {
        console.error('Camera error:', e);
    }
}

async function pollServerForIdentity() {
    if (!isPreviewing) return;
    if (isPredicting) {
        setTimeout(pollServerForIdentity, 200);
        return;
    }

    isPredicting = true;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = previewVideo.videoWidth;
        canvas.height = previewVideo.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(previewVideo, 0, 0); // Raw image for server
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);

        const formData = new FormData();
        formData.append('image', dataUrl);

        const res = await fetch('/predict_face', {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            const data = await res.json();
            if (data.match) {
                lastPrediction = { name: data.name, time: Date.now() };
            } else {
                lastPrediction = { name: 'Unknown', time: Date.now() };
            }
        }
    } catch (e) {
        console.error("Prediction polling error", e);
    } finally {
        isPredicting = false;
        // Poll every 500ms
        if (isPreviewing) setTimeout(pollServerForIdentity, 500);
    }
}

let lastCheckInTimes = {};

// async function triggerAttendanceCheckIn(name) {
//     const now = Date.now();
//     // Throttle: Only check in once every 60 seconds per person
//     if (lastCheckInTimes[name] && (now - lastCheckInTimes[name]) < 60000) {
//         return;
//     }

//     lastCheckInTimes[name] = now;
//     console.log(`Triggering checkup for ${name}...`);
//     try {
//         // We need to send an image + shift to /capture 
//         // /capture forwards to FastAPI /checkin which expects 'file' and 'shift'

//         const canvas = document.createElement('canvas');
//         canvas.width = previewVideo.videoWidth;
//         canvas.height = previewVideo.videoHeight;
//         const ctx = canvas.getContext('2d');
//         ctx.drawImage(previewVideo, 0, 0);
//         const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

//         // Determine Shift based on time? Or default?
//         // Let's guess shift based on hour for demo, or hardcode 'Morning'
//         const h = new Date().getHours();
//         let shift = "Morning";
//         if (h >= 12 && h < 18) shift = "Afternoon";
//         if (h >= 18) shift = "Evening";

//         const formData = new FormData();
//         formData.append('image', dataUrl);
//         formData.append('shift', shift);

//         // To make this work with existing /capture which expects 'image' string in form-data
//         // We use fetch form-urlencoded or FormData? 
//         // app_flask.py /capture expects `image_data = request.form.get('image')` (base64 string)

//         const fd = new FormData();
//         fd.append('image', dataUrl);
//         fd.append('shift', shift);

//         const res = await fetch('/capture', {
//             method: 'POST',
//             body: fd
//         });

//         const json = await res.json();
//         console.log("Check-in result:", json);

//         if (res.ok) {
//             // Visual feedback? 
//             const toast = document.createElement('div');
//             toast.className = "fixed bottom-5 right-5 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50 animate-bounce";
//             toast.innerText = `Checked in: ${name}`;
//             document.body.appendChild(toast);
//             setTimeout(() => toast.remove(), 3000);
//         }

//     } catch (e) {
//         console.error("Auto check-in failed", e);
//     }
// }

function stopPreview() {
    isPreviewing = false;
    cancelAnimationFrame(previewRequestId);
    if (previewVideo.srcObject) {
        previewVideo.srcObject.getTracks().forEach(t => t.stop());
        previewVideo.srcObject = null;
    }
    previewPlaceholder.classList.remove('hidden');
    const ctx = previewCanvas.getContext('2d');
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
}
