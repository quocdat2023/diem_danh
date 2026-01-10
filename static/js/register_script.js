
let capturedImages = [];
let videoStream = null;

// Helper functions from rocksetta
function resizeCanvasAndResults(dimensions, canvas, results) {
    const { width, height } = dimensions instanceof HTMLVideoElement
        ? faceapi.getMediaDimensions(dimensions)
        : dimensions;
    canvas.width = width;
    canvas.height = height;
    return results.map(res => res.forSize(width, height));
}

function drawDetections(dimensions, canvas, detections) {
    const resizedDetections = resizeCanvasAndResults(dimensions, canvas, detections);
    faceapi.drawDetection(canvas, resizedDetections);
}

function drawLandmarks(dimensions, canvas, results, withBoxes = true) {
    const resizedResults = resizeCanvasAndResults(dimensions, canvas, results);
    // if (withBoxes) {
    //     faceapi.drawDetection(canvas, resizedResults.map(det => det.detection));
    // }
    const faceLandmarks = resizedResults.map(det => det.landmarks);
    const drawLandmarksOptions = { lineWidth: 2, drawLines: true, color: 'green' };
    faceapi.drawLandmarks(canvas, faceLandmarks, drawLandmarksOptions);
}

// Show alert messages
function showAlert(message, type = 'danger') {
    const alertContainer = document.getElementById('alertContainer');
    alertContainer.innerHTML = `
                <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                    ${message}
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>`;
}

// Start webcam
async function startVideo() {
    const video = document.getElementById('inputVideo');
    const captureButton = document.getElementById('captureRegister');
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = videoStream;
        video.onplay = onPlay;
        captureButton.disabled = false;
    } catch (err) {
        console.error('Error accessing camera:', err);
        showAlert('Không thể truy cập camera. Vui lòng kiểm tra quyền truy cập.');
    }
}

// Stop webcam
function stopVideo() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
        document.getElementById('inputVideo').srcObject = null;
        document.getElementById('captureRegister').disabled = true;
    }
}

// Face detection on video
async function onPlay() {
    const videoEl = document.getElementById('inputVideo');
    const canvas = document.getElementById('overlay');
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 128, scoreThreshold: 0.3 });

    const result = await faceapi.detectSingleFace(videoEl, options).withFaceLandmarks(true);
    if (result) {
        drawLandmarks(videoEl, canvas, [result], true);
    } else {
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
    setTimeout(() => onPlay());
}

// Capture image from webcam
function captureImage() {
    const video = document.getElementById('inputVideo');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg');
    capturedImages.push(imageData);
    displayCapturedImages();
}

// Display captured images
function displayCapturedImages() {
    const preview = document.getElementById('imagePreview');
    preview.innerHTML = '';
    capturedImages.forEach((imageData, index) => {
        const div = document.createElement('div');
        div.className = 'image-preview-item';
        const img = document.createElement('img');
        img.src = imageData;
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'X';
        removeBtn.onclick = () => {
            capturedImages.splice(index, 1);
            displayCapturedImages();
        };
        div.appendChild(img);
        div.appendChild(removeBtn);
        preview.appendChild(div);
    });
}

// Load attendance list
async function loadAttendanceList() {
    try {
        const response = await fetch('/attendance');
        if (!response.ok) throw new Error('Server did not return JSON');
        const attendances = await response.json();
        const list = document.getElementById('attendanceList');
        list.innerHTML = '';
        attendances.forEach(att => {
            const li = document.createElement('li');
            li.className = 'list-group-item';
            li.textContent = `ID: ${att.id_student}, Tên: ${att.student_name}, Ngày: ${new Date(att.date).toLocaleString('vi-VN')}, Trạng thái: ${att.status}`;
            list.appendChild(li);
        });
    } catch (err) {
        console.error('Error loading attendance:', err);
        showAlert('Không thể tải danh sách điểm danh. Vui lòng kiểm tra server.');
    }
}

// Register student
async function registerStudent(event) {
    event.preventDefault();
    const form = document.getElementById('registerForm');
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    const formData = new FormData(form);
    const imageFiles = document.getElementById('image_file').files;

    if (capturedImages.length === 0 && imageFiles.length === 0) {
        showAlert('Vui lòng chụp hoặc tải lên ít nhất một ảnh!');
        submitButton.disabled = false;
        return;
    }

    capturedImages.forEach((imageData, index) => {
        const blob = dataURLtoBlob(imageData);
        formData.append('image_files', blob, `captured_image_${index}.jpg`);
    });

    try {
        const response = await fetch('/register_student', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (response.ok) {
            showAlert('Đăng ký thành công!', 'success');
            setTimeout(() => window.location.href = '/', 2000);
        } else {
            showAlert(result.error || 'Đăng ký thất bại. Vui lòng thử lại ở nơi có ánh sáng tốt hơn.', 'danger');
        }
    } catch (err) {
        console.error('Fetch error:', err);
        showAlert('Không thể kết nối với server. Vui lòng kiểm tra backend.');
    } finally {
        submitButton.disabled = false;
    }
}

// Convert data URL to Blob
function dataURLtoBlob(dataURL) {
    const byteString = atob(dataURL.split(',')[1]);
    const mimeString = dataURL.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
}

// Handle uploaded images
document.getElementById('image_file').addEventListener('change', async (event) => {
    const files = event.target.files;
    const preview = document.getElementById('imagePreview');
    for (let file of files) {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 128, scoreThreshold: 0.3 });
            const detections = await faceapi.detectAllFaces(canvas, options).withFaceLandmarks(true);
            if (detections.length === 0) {
                showAlert(`Không tìm thấy khuôn mặt trong ảnh: ${file.name}`);
                return;
            }
            if (detections.length > 1) {
                showAlert(`Ảnh ${file.name} chứa nhiều khuôn mặt. Vui lòng chọn ảnh khác.`);
                return;
            }
            drawLandmarks(canvas, canvas, detections, true);
            const div = document.createElement('div');
            div.className = 'image-preview-item';
            const previewImg = document.createElement('img');
            previewImg.src = canvas.toDataURL('image/jpeg');
            const removeBtn = document.createElement('button');
            removeBtn.textContent = 'X';
            removeBtn.onclick = () => div.remove();
            div.appendChild(previewImg);
            div.appendChild(removeBtn);
            preview.appendChild(div);
        };
    }
});

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    await faceapi.loadTinyFaceDetectorModel('https://www.rocksetta.com/tensorflowjs/saved-models/face-api-js/');
    await faceapi.loadFaceLandmarkTinyModel('https://www.rocksetta.com/tensorflowjs/saved-models/face-api-js/');
    loadAttendanceList();

    document.getElementById('startWebcam').addEventListener('click', startVideo);
    document.getElementById('captureRegister').addEventListener('click', captureImage);
    document.getElementById('registerForm').addEventListener('submit', registerStudent);
});
