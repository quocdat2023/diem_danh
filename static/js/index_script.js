document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('webcam');
    const toggleBtn = document.getElementById('toggleBtn');
    const scanLine = document.getElementById('scanLine');
    const clock = document.getElementById('clock');

    let stream = null;
    let isScanning = false;
    let scanInterval = null;
    let isProcessing = false;
    let lastToastTime = 0; // Throttle toasts

    // Clock
    setInterval(() => {
        const now = new Date();
        clock.innerText = now.toLocaleTimeString('en-US', { hour12: false });
    }, 1000);

    const shiftSelect = document.getElementById('shiftSelect');

    toggleBtn.addEventListener('click', () => {
        if (!stream) {
            if (shiftSelect.value === "") {
                Toastify({
                    text: "Please select a Shift first!",
                    duration: 3000,
                    gravity: "top",
                    position: "center",
                    style: { background: "#f59e0b" }
                }).showToast();
                return;
            }
            startCamera();
        } else {
            stopCamera();
        }
    });

    async function startCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;

            toggleBtn.innerHTML = '<i data-lucide="square"></i> Stop Camera';
            toggleBtn.className = "bg-red-500 hover:bg-red-600 text-white px-8 py-3 rounded-xl font-semibold shadow-lg shadow-red-500/30 transition active:scale-95 flex items-center gap-2";
            lucide.createIcons();

            scanLine.classList.remove('hidden');
            isScanning = true;

            video.onloadedmetadata = () => {
                startScanningLoop();
            };

            Toastify({
                text: "Camera Started",
                duration: 2000,
                gravity: "top",
                position: "center",
                style: { background: "#3b82f6" }
            }).showToast();

        } catch (err) {
            console.error("Error accessing webcam:", err);
            Toastify({
                text: "Could not access camera",
                duration: 3000,
                gravity: "top",
                position: "center",
                style: { background: "#ef4444" }
            }).showToast();
        }
    }

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
            video.srcObject = null;
        }

        isScanning = false;
        clearTimeout(scanInterval);
        scanLine.classList.add('hidden');

        toggleBtn.innerHTML = '<i data-lucide="play"></i> Start Camera';
        toggleBtn.className = "bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-semibold shadow-lg shadow-blue-500/30 transition active:scale-95 flex items-center gap-2";
        lucide.createIcons();
    }

    function startScanningLoop() {
        if (!isScanning) return;

        // Scan every 1.5 seconds
        scanInterval = setTimeout(async () => {
            if (isScanning) {
                await captureAndCheck();
                startScanningLoop();
            }
        }, 1500);
    }

    async function captureAndCheck() {
        if (isProcessing) return;
        isProcessing = true;

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        const shift = shiftSelect.value;

        try {
            const formData = new FormData();
            formData.append('image', dataUrl);
            formData.append('shift', shift);

            const response = await fetch('/capture', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                showToast(`Checked in: ${data.student} (${data.shift})`, 'success');
            } else {
                if (data.detail === "No faces detected" || data.error?.includes("No faces")) {
                    // Do nothing
                } else {
                    // Show specific error (e.g. "Already checked in" or "Wrong Day")
                    let msg = data.detail || data.error || "Unknown Error";
                    // If detailed error is object, try to parse
                    showToast(msg, 'error');
                }
            }

        } catch (error) {
            console.error(error);
        } finally {
            isProcessing = false;
        }
    }

    function showToast(message, type) {
        const now = Date.now();
        if (now - lastToastTime < 3000) return; // Throttle to every 3 seconds
        lastToastTime = now;

        const bg = type === 'success' ? "linear-gradient(to right, #00b09b, #96c93d)" : "#ef4444";

        Toastify({
            text: message,
            duration: 3000,
            destination: "#",
            newWindow: true,
            close: true,
            gravity: "top", // `top` or `bottom`
            position: "center", // `left`, `center` or `right`
            stopOnFocus: true, // Prevents dismissing of toast on hover
            style: {
                background: bg,
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                borderRadius: "8px",
                fontWeight: "600"
            },
        }).showToast();
    }
});