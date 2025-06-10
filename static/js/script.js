function startVideo() {
    const video = document.getElementById('video');
    if (video) {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => video.srcObject = stream)
            .catch(err => console.error('Error accessing camera:', err));
    }
}

async function captureImage() {
    const video = document.getElementById('video');
    const canvas = document.createElement('canvas');
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

async function registerStudent(event) {
    event.preventDefault();
    const form = document.getElementById('registerForm');
    const formData = new FormData(form);
    const video = document.getElementById('video');
    const imageFile = formData.get('image_file');

    if (!imageFile.size) {
        // Chụp ảnh từ camera nếu không có file upload
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        formData.set('image', canvas.toDataURL('image/jpeg'));
    }

    try {
        const response = await fetch('/register_student', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        alert(result.message || result.error);
        if (!result.error) {
            window.location.href = '/';
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    startVideo();
    loadAttendanceList();

    const captureButton = document.getElementById('capture');
    if (captureButton) {
        captureButton.addEventListener('click', captureImage);
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', registerStudent);
    }

    const captureRegister = document.getElementById('captureRegister');
    if (captureRegister) {
        captureRegister.addEventListener('click', () => {
            const imageFileInput = document.getElementById('image_file');
            imageFileInput.value = ''; // Xóa file upload nếu chụp từ camera
        });
    }
});