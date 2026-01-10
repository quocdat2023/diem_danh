let videoStream = null;

// Helper functions (adapted from rocksetta/register.html)
function resizeCanvasAndResults(dimensions, canvas, results) {
    const { width, height } = dimensions instanceof HTMLVideoElement
        ? faceapi.getMediaDimensions(dimensions)
        : dimensions;
    canvas.width = width;
    canvas.height = height;
    return results.map(res => res.forSize(width, height));
}

function drawLandmarks(dimensions, canvas, results, withBoxes = true) {
    const resizedResults = resizeCanvasAndResults(dimensions, canvas, results);
    if (withBoxes) {
        faceapi.drawDetection(canvas, resizedResults.map(det => det.detection));
    }
    // const faceLandmarks = resizedResults.map(det => det.landmarks);
    // const drawLandmarksOptions = { lineWidth: 2, drawLines: true, color: 'green' };
    // faceapi.drawLandmarks(canvas, faceLandmarks, drawLandmarksOptions);
}

async function startVideo() {
    const video = document.getElementById('video');
    if (!video) return;

    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = videoStream;

        video.onplay = () => {
            onPlay(video);
        };
    } catch (err) {
        console.error('Error accessing camera:', err);
        alert('Cannot access camera');
    }
}

async function onPlay(videoEl) {
    if (videoEl.paused || videoEl.ended || !faceapi.nets.tinyFaceDetector.params)
        return setTimeout(() => onPlay(videoEl));

    const canvas = document.getElementById('overlay');
    if (!canvas) return;

    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 128, scoreThreshold: 0.3 });
    const result = await faceapi.detectSingleFace(videoEl, options).withFaceLandmarks(true);

    if (result) {
        drawLandmarks(videoEl, canvas, [result], true);
    } else {
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
    }

    setTimeout(() => onPlay(videoEl), 100);
}

async function captureImage() {
    const video = document.getElementById('video');
    const canvas = document.createElement('canvas'); // Create a temporary canvas for capture
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg');

    try {
        const response = await fetch('/capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `image=${encodeURIComponent(imageData)}`
        });
        const result = await response.json();
        alert(result.message || result.error);
        loadAttendanceList();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function loadAttendanceList() {
    try {
        const response = await fetch('/attendance');
        const attendances = await response.json();
        const list = document.getElementById('attendanceList');
        if (list) {
            list.innerHTML = '';
            attendances.forEach(att => {
                const li = document.createElement('li');
                li.className = 'list-group-item';
                li.textContent = `ID Student: ${att.id_student}, Student: ${att.student_name}, Date: ${new Date(att.date).toLocaleString()}, Status: ${att.status}`;
                list.appendChild(li);
            });
        }
    } catch (err) {
        console.error('Error loading attendance:', err);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Load models
    try {
        await faceapi.loadTinyFaceDetectorModel('https://www.rocksetta.com/tensorflowjs/saved-models/face-api-js/');
        await faceapi.loadFaceLandmarkTinyModel('https://www.rocksetta.com/tensorflowjs/saved-models/face-api-js/');
        console.log("Models loaded");
    } catch (e) {
        console.error("Error loading models", e);
    }

    startVideo();
    loadAttendanceList();

    const captureButton = document.getElementById('capture');
    if (captureButton) {
        captureButton.addEventListener('click', captureImage);
    }
});