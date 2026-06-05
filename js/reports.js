// js/reports.js

import { db } from './firebase-init.js';
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

let allReports = {}; 
let wmoList = []; 
let currentEditingReportId = null;

// ==========================================
// 1. FETCH WMO OFFICERS FOR DROPDOWN
// ==========================================
function loadWMOs() {
    onSnapshot(collection(db, 'users'), (snapshot) => {
        wmoList = [];
        const wmoSelect = document.getElementById('modalWmoSelect');
        wmoSelect.innerHTML = '<option value="">-- Unassigned --</option>';

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const role = data.role ? data.role.toLowerCase() : '';
            
            if (role.includes('waste management operator') || role === 'wmo') {
                wmoList.push({ id: docSnap.id, ...data });
                wmoSelect.innerHTML += `<option value="${docSnap.id}">${data.name} (${data.presint || 'All Areas'})</option>`;
            }
        });
    });
}

// ==========================================
// 2. FETCH REPORTS
// ==========================================
function loadReports() {
    onSnapshot(collection(db, 'reports'), (snapshot) => {
        const tableBody = document.getElementById('reportsTableBody');
        tableBody.innerHTML = '';
        allReports = {}; 

        if (snapshot.empty) {
            // Updated to colspan="8"
            tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No reports found.</td></tr>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            allReports[id] = data; 

            const shortId = data.report_id ? data.report_id.substring(0,8) + '...' : id.substring(0,6) + '...';
            const type = data.type || 'Unknown';
            const prediction = data.ai_prediction || 'Unanalyzed';
            const address = data.address ? data.address.substring(0, 30) + '...' : 'Coordinates provided';
            const wmoName = data.assigned_wmo_name || '<span style="color: var(--warning);">Unassigned</span>';
            
            // Format dates for display AND filtering
            let displayDate = 'N/A';
            let isoDate = ''; // This will hold the "YYYY-MM-DD" format for the filter matching
            
            if (data.timestamp) {
                const dateObj = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
                // Human readable display date
                displayDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                
                // Adjust for local timezone to match HTML date picker
                const offset = dateObj.getTimezoneOffset() * 60000;
                const localISOTime = (new Date(dateObj - offset)).toISOString().slice(0, -1);
                isoDate = localISOTime.split('T')[0];
            }

            let statusText = data.status || 'Pending';
            let statusClass = 'pending';
            if (statusText.toLowerCase() === 'resolved' || statusText.toLowerCase() === 'done' || statusText.toLowerCase() === 'completed') {
                statusClass = 'completed';
                statusText = 'Resolved';
            }
            if (statusText.toLowerCase() === 'in progress') statusClass = 'in-progress';
            if (statusText.toLowerCase() === 'rejected') statusClass = 'rejected';

            // Include data-date attribute directly in the row tag
            const row = `
                <tr data-date="${isoDate}">
                    <td style="font-weight: bold; color: var(--text-secondary);" title="${data.report_id || id}">${shortId}</td>
                    <td style="font-weight: 500;">${type}</td>
                    <td style="font-weight: 500;">${prediction.replace('_', ' ')}</td>
                    <td>${address}</td>
                    <td style="font-weight: 500;">${wmoName}</td>
                    <td>
                        <span class="status-badge ${statusClass}">
                            <span class="status-dot"></span>
                            ${statusText}
                        </span>
                    </td>
                    <td><span style="font-size: 0.85rem; color: var(--text-secondary);">${displayDate}</span></td>
                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="window.openReportModal('${id}')">Review / Assign</button>
                    </td>
                </tr>
            `;
            tableBody.innerHTML += row;
        });
        
        // Re-apply filter automatically whenever data refreshes
        filterTable();
    });
}

loadWMOs();
loadReports();


// ==========================================
// 3. MODAL LOGIC & AUTO-ASSIGN ALGORITHM
// ==========================================
window.openReportModal = function(id) {
    const data = allReports[id];
    if (!data) return;

    currentEditingReportId = id;

    // Populate Read-Only Fields
    document.getElementById('modalReportId').value = data.report_id || id;
    document.getElementById('modalType').value = data.type || 'N/A';
    document.getElementById('modalCondition').value = data.condition || 'N/A';
    document.getElementById('modalSize').value = data.size || 'N/A';
    document.getElementById('modalAddress').value = data.address || 'Coordinates provided';
    document.getElementById('modalUserDesc').value = data.description || 'No description provided by user.';
    document.getElementById('modalAiDesc').value = data.ai_explanation || 'No AI explanation available.';

    if (data.confidence) {
        document.getElementById('modalConfidence').value = (parseFloat(data.confidence) * 100).toFixed(1) + '%';
    } else {
        document.getElementById('modalConfidence').value = 'N/A';
    }

    let timeString = 'N/A';
    if (data.timestamp) {
        const date = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
        timeString = date.toLocaleString();
    }
    document.getElementById('modalTime').value = timeString;

    // Populate Image
    const imgEl = document.getElementById('modalImage');
    const noImgEl = document.getElementById('modalNoImage');
    let imageUrl = data.image_url;
    if (!imageUrl && data.all_images && data.all_images.length > 0) {
        imageUrl = data.all_images[0]; 
    }
    if (imageUrl) {
        imgEl.src = imageUrl;
        imgEl.style.display = 'inline-block';
        noImgEl.style.display = 'none';
    } else {
        imgEl.style.display = 'none';
        noImgEl.style.display = 'block';
    }

    // Set Editable Dropdowns
    const safePrediction = data.ai_prediction || 'Unanalyzed';
    const predictionSelect = document.getElementById('modalPrediction');
    let optionExists = Array.from(predictionSelect.options).some(opt => opt.value === safePrediction);
    predictionSelect.value = optionExists ? safePrediction : 'Unanalyzed';

    let rawStatus = data.status || 'Pending';
    if(rawStatus.toLowerCase() === 'done' || rawStatus.toLowerCase() === 'completed') rawStatus = 'Resolved';
    document.getElementById('modalStatusSelect').value = rawStatus;
    
    document.getElementById('modalWmoSelect').value = data.assigned_wmo_id || '';

    window.openModal('reportModal');
}

// --- SMART LOCATION-BASED AUTO-ASSIGN ---
document.getElementById('autoAssignBtn').addEventListener('click', () => {
    if (!currentEditingReportId) return;
    if (wmoList.length === 0) {
        alert("There are no WMO officers available in the system!");
        return;
    }

    const reportData = allReports[currentEditingReportId];
    const reportAddress = (reportData.address || '').toLowerCase();

    let detectedPresintNum = null;
    const presintMatch = reportAddress.match(/presint\s*(\d+)/);
    
    if (presintMatch && presintMatch[1]) {
        detectedPresintNum = presintMatch[1]; 
    }

    if (!detectedPresintNum) {
        alert("Could not detect a specific Presint in the report's address to auto-assign.");
        return;
    }

    const matchingWMOs = wmoList.filter(wmo => {
        const wmoCoverage = (wmo.presint || '').toLowerCase();
        const regex = new RegExp(`\\b${detectedPresintNum}\\b`);
        return regex.test(wmoCoverage);
    });

    if (matchingWMOs.length === 0) {
        alert(`No WMO officer found covering Presint ${detectedPresintNum}.`);
        return;
    }

    const sortedWMOs = matchingWMOs.sort((a, b) => {
        return (a['Assigned Reports'] || 0) - (b['Assigned Reports'] || 0);
    });

    const selectedWMO = sortedWMOs[0]; 
    document.getElementById('modalWmoSelect').value = selectedWMO.id;
    
    alert(`Smart Assign: Selected ${selectedWMO.name} because they cover Presint ${detectedPresintNum}.`);
});


// ==========================================
// 4. UPDATE REPORT IN FIREBASE
// ==========================================
document.getElementById('updateReportBtn').addEventListener('click', async () => {
    if (!currentEditingReportId) return;

    const btn = document.getElementById('updateReportBtn');
    const originalText = btn.innerText;
    btn.innerText = "Saving...";
    btn.disabled = true;

    try {
        const newStatus = document.getElementById('modalStatusSelect').value;
        const newPrediction = document.getElementById('modalPrediction').value;
        
        const wmoSelect = document.getElementById('modalWmoSelect');
        const newWmoId = wmoSelect.value;
        let newWmoName = null;
        if (newWmoId !== "") {
            newWmoName = wmoSelect.options[wmoSelect.selectedIndex].text.split(' (')[0];
        }

        await updateDoc(doc(db, 'reports', currentEditingReportId), {
            status: newStatus,
            ai_prediction: newPrediction,
            assigned_wmo_id: newWmoId,
            assigned_wmo_name: newWmoName
        });

        window.closeModal('reportModal');
        
    } catch (error) {
        console.error("Error updating report:", error);
        alert("Failed to update: " + error.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});


// ==========================================
// 5. DELETE REPORT FROM FIREBASE
// ==========================================
const deleteReportBtn = document.getElementById('deleteReportBtn');
if (deleteReportBtn) {
    deleteReportBtn.addEventListener('click', async () => {
        if (!currentEditingReportId) return;

        const confirmDelete = window.confirm("Are you sure you want to delete this waste report? This action cannot be undone.");
        
        if (confirmDelete) {
            const originalText = deleteReportBtn.innerText;
            deleteReportBtn.innerText = "Deleting...";
            deleteReportBtn.disabled = true;

            try {
                await deleteDoc(doc(db, 'reports', currentEditingReportId));
                window.closeModal('reportModal');
            } catch (error) {
                console.error("Error deleting report:", error);
                alert("Failed to delete: " + error.message);
            } finally {
                deleteReportBtn.innerText = originalText;
                deleteReportBtn.disabled = false;
            }
        }
    });
}


// ==========================================
// 6. SEARCH & FILTER LOGIC
// ==========================================
function filterTable() {
    let searchValue = document.getElementById("reportSearch").value.toLowerCase();
    let statusFilter = document.getElementById("statusFilter").value.toLowerCase();
    let dateFilter = document.getElementById("dateFilter").value; // Format: "YYYY-MM-DD"
    let rows = document.querySelectorAll("#reportsTableBody tr");

    rows.forEach(row => {
        if (row.innerText.includes("Loading") || row.innerText.includes("No reports")) return;
        
        let rowText = row.textContent.toLowerCase();
        let matchesSearch = rowText.includes(searchValue);
        let matchesStatus = statusFilter === "" || rowText.includes(statusFilter);
        
        // Date Logic Check
        let rowDate = row.getAttribute("data-date") || "";
        let matchesDate = dateFilter === "" || rowDate === dateFilter;

        row.style.display = (matchesSearch && matchesStatus && matchesDate) ? "" : "none";
    });
}

// Attach all event listeners
document.getElementById("reportSearch").addEventListener("keyup", filterTable);
document.getElementById("statusFilter").addEventListener("change", filterTable);
document.getElementById("dateFilter").addEventListener("change", filterTable);