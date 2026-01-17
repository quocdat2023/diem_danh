document.addEventListener('DOMContentLoaded', () => {
    const addClassBtn = document.getElementById('addClassBtn');
    const classesColumn = document.getElementById('classesColumn');
    const classCardTemplate = document.getElementById('classCardTemplate');
    const trainBtn = document.getElementById('trainBtn');
    const progressBar = document.getElementById('progressBar');
    const trainStatus = document.getElementById('trainStatus');

    // Add initial class
    addClassCard();

    addClassBtn.addEventListener('click', () => {
        addClassCard();
    });

    trainBtn.addEventListener('click', async () => {
        trainBtn.disabled = true;
        trainStatus.innerText = "Starting training...";
        progressBar.style.width = "0%";

        const cards = document.querySelectorAll('.class-card');
        // Initial check: Filter out the template itself if it acts as a card, 
        // but here we used cloneNode from template, so queried .class-card are the live ones.
        // Identify valid cards (those with images)

        const validCards = [];
        cards.forEach(card => {
            const nameInput = card.querySelector('.class-name-input');
            const images = card.querySelectorAll('.samples-thumbs img');
            if (images.length > 0 && nameInput.value.trim() !== "") {
                validCards.push({
                    card: card,
                    name: nameInput.value.trim(),
                    images: images
                });
            }
        });

        if (validCards.length === 0) {
            alert("Please add at least one class with images and a name.");
            trainBtn.disabled = false;
            trainStatus.innerText = "Ready";
            return;
        }

        let successCount = 0;
        let failCount = 0;
        const total = validCards.length;

        for (let i = 0; i < total; i++) {
            const item = validCards[i];
            trainStatus.innerText = `Training class ${i + 1}/${total}: ${item.name}`;

            try {
                // Generate a simple ID or use name. 
                // To avoid collisions/errors with same name, we might append timestamp or random string
                // But for "Training", usually we want a specific ID. 
                // For now, let's use name + random suffix to ensure uniqueness as per previous analysis
                const studentId = item.name.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now();

                const formData = new FormData();
                formData.append('student_id', studentId);
                formData.append('name', item.name);

                // Convert base64 images back to blobs
                for (let img of item.images) {
                    const response = await fetch(img.src);
                    const blob = await response.blob();
                    formData.append('image_files', blob, "capture.jpg");
                }

                const response = await fetch('/register_student', {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    successCount++;
                    // Visual feedback on card?
                    item.card.style.border = "2px solid #22c55e"; // Green
                } else {
                    failCount++;
                    const err = await response.json();
                    console.error("Error registering:", err);
                    item.card.style.border = "2px solid #ef4444"; // Red
                }

            } catch (error) {
                console.error("Network error:", error);
                failCount++;
            }

            // Update Progress
            const percentage = ((i + 1) / total) * 100;
            progressBar.style.width = `${percentage}%`;
        }

        trainStatus.innerText = `Completed. Success: ${successCount}, Failed: ${failCount}`;
        setTimeout(() => {
            trainBtn.disabled = false;
            if (successCount === total) {
                trainStatus.innerText = "Training Complete!";
                // Reset progress after a delay
                setTimeout(() => { progressBar.style.width = "0%"; }, 2000);
            }
        }, 1000);
    });

    function addClassCard() {
        const clone = classCardTemplate.content.cloneNode(true);
        const card = clone.querySelector('.class-card');

        // Setup Card Events
        setupCardEvents(card);

        // Insert before the Add Button
        classesColumn.insertBefore(card, addClassBtn);

        // Scroll to bottom
        classesColumn.scrollTop = classesColumn.scrollHeight;
    }

    function setupCardEvents(card) {
        const deleteBtn = card.querySelector('.delete-class-btn');
        const webcamBtn = card.querySelector('.webcam-btn');
        // const uploadBtn = card.querySelector('.upload-btn'); // Not implemented

        const initialView = card.querySelector('.initial-view');
        const webcamView = card.querySelector('.webcam-view');

        const video = card.querySelector('video');
        const overlayCanvas = card.querySelector('canvas'); // For future face detection overlay
        const recordBtn = card.querySelector('.record-btn');
        const closeWebcamBtn = card.querySelector('.close-webcam-btn');
        const samplesThumbs = card.querySelector('.samples-thumbs');
        const sampleCount = card.querySelector('.sample-count');

        let stream = null;
        let recordingInterval = null;

        // DELETE
        deleteBtn.addEventListener('click', () => {
            if (stream) {
                stopStream(stream);
            }
            card.remove();
        });

        // WEBCAM OPEN
        webcamBtn.addEventListener('click', async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
                video.srcObject = stream;
                initialView.classList.add('hidden');
                webcamView.classList.remove('hidden');
            } catch (err) {
                console.error("Error accessing webcam:", err);
                alert("Could not access webcam.");
            }
        });

        // CLOSE WEBCAM
        closeWebcamBtn.addEventListener('click', () => {
            stopStream(stream);
            stream = null;
            webcamView.classList.add('hidden');
            initialView.classList.remove('hidden');
        });

        // RECORDING LOGIC
        const captureFrame = () => {
            if (!stream) return;
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            // Check if we need to mirror? Video is transformed scale-x-[-1] in CSS.
            // When drawing to canvas for upload, usually we want the raw image (not mirrored) 
            // OR the mirrored one if that's what user expects. 
            // Usually raw is better for training models effectively if alignment matters, 
            // but `face_recognition` handles it. 
            // Let's draw it normally.
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            addSampleImage(dataUrl);
        };

        const addSampleImage = (src) => {
            const imgContainer = document.createElement('div');
            imgContainer.className = "relative group w-full h-12 bg-gray-200 rounded overflow-hidden";

            const img = document.createElement('img');
            img.src = src;
            img.className = "w-full h-full object-cover";

            const removeOverlay = document.createElement('div');
            removeOverlay.className = "absolute inset-0 bg-black/50 invisible group-hover:visible flex items-center justify-center cursor-pointer";
            removeOverlay.innerHTML = '<i class="fa-solid fa-trash text-white text-xs"></i>';
            removeOverlay.addEventListener('click', () => {
                imgContainer.remove();
                updateCount();
            });

            imgContainer.appendChild(img);
            imgContainer.appendChild(removeOverlay);

            samplesThumbs.insertBefore(imgContainer, samplesThumbs.firstChild);

            // Limit shown samples? No, CSS grid handles it. content-area might strictly need height update?
            // The template CSS: .samples-thumbs { h-0 transition-all ... } 
            // We probably need to make it visible
            samplesThumbs.style.height = "auto";
            samplesThumbs.classList.add("pb-4");

            updateCount();
        };

        const updateCount = () => {
            const count = samplesThumbs.querySelectorAll('img').length;
            sampleCount.innerText = count;
        };

        // HOLD TO RECORD
        const startRecording = () => {
            if (recordingInterval) return;
            captureFrame(); // Immediate capture
            recordingInterval = setInterval(captureFrame, 200); // Capture every 200ms
            recordBtn.classList.add('bg-red-100', 'text-red-600', 'border-red-300');
            recordBtn.innerText = "Recording...";
        };

        const stopRecording = () => {
            if (recordingInterval) {
                clearInterval(recordingInterval);
                recordingInterval = null;
            }
            recordBtn.classList.remove('bg-red-100', 'text-red-600', 'border-red-300');
            recordBtn.innerText = "Hold to Record";
        };

        // Mouse events
        recordBtn.addEventListener('mousedown', startRecording);
        recordBtn.addEventListener('mouseup', stopRecording);
        recordBtn.addEventListener('mouseleave', stopRecording); // Stop if dragged out

        // Touch events for mobile
        recordBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); });
        recordBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopRecording(); });
    }

    function stopStream(stream) {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    }

    // --- Registered Users Logic ---
    const registeredUsersList = document.getElementById('registeredUsersList');

    async function fetchRegisteredUsers() {
        try {
            const response = await fetch('/students');
            if (!response.ok) throw new Error("Failed to fetch");
            const students = await response.json();
            renderRegisteredUsers(students);
        } catch (error) {
            console.error(error);
            registeredUsersList.innerHTML = '<p class="text-red-500 text-sm">Failed to load users.</p>';
        }
    }

    function renderRegisteredUsers(students) {
        registeredUsersList.innerHTML = '';
        if (students.length === 0) {
            registeredUsersList.innerHTML = '<p class="text-slate-400 text-sm italic">No registered students.</p>';
            return;
        }

        students.forEach(student => {
            const div = document.createElement('div');
            div.className = "bg-white p-4 rounded-lg shadow-sm border flex justify-between items-center group";
            div.innerHTML = `
                <div>
                    <h4 class="font-medium text-slate-800">${student.name}</h4>
                    <p class="text-xs text-slate-400 font-mono">${student.student_id}</p>
                </div>
                <button class="delete-user-btn text-slate-300 hover:text-red-500 transition p-2" title="Delete User">
                    <i class="fa-solid fa-trash"></i>
                </button>
            `;

            const delBtn = div.querySelector('.delete-user-btn');
            delBtn.addEventListener('click', () => deleteUser(student.student_id));

            registeredUsersList.appendChild(div);
        });
    }

    async function deleteUser(studentId) {
        if (!confirm("Are you sure you want to delete this student?")) return;

        try {
            const response = await fetch(`/student/${studentId}`, { method: 'DELETE' });
            if (response.ok) {
                fetchRegisteredUsers(); // Refresh list
            } else {
                alert("Failed to delete user");
            }
        } catch (error) {
            console.error(error);
            alert("Error deleting user");
        }
    }

    // Initial Load
    fetchRegisteredUsers();
});
