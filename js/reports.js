// js/reports.js

import { db } from './firebase-init.js';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

let allReports = {}; 
let wmoList = []; 
let currentEditingReportId = null;

// ==========================================
// CUSTOM POPUP FUNCTION (TOAST)
// ==========================================
window.showPopupMessage = function(message, type = 'success') {
    const popup = document.getElementById("customPopup");
    const msgText = document.getElementById("popupMessage");
    const icon = document.getElementById("popupIcon");

    msgText.innerText = message;
    
    popup.className = "custom-popup"; 
    
    if (type === 'error') {
        popup.classList.add("error");
        icon.innerText = "⚠️";
    } else {
        popup.classList.add("success");
        icon.innerText = "✅";
    }

    popup.classList.add("show");

    setTimeout(function() {
        popup.classList.remove("show");
    }, 3000);
}

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
// 2. FETCH REPORTS & CALCULATE OVERDUE
// ==========================================
function loadReports() {
    const reportsQuery = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));

    onSnapshot(reportsQuery, (snapshot) => {
        const tableBody = document.getElementById('reportsTableBody');
        tableBody.innerHTML = '';
        allReports = {}; 

        if (snapshot.empty) {
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
            
            let displayDate = 'N/A';
            let isoDate = ''; 
            
            if (data.timestamp) {
                const dateObj = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
                displayDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

            // --- OVERDUE CALCULATION LOGIC ---
            let isOverdue = false;
            let daysOld = 0;
            let overdueBadge = '';

            if (data.timestamp) {
                const reportDate = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
                const today = new Date();
                const diffTime = Math.abs(today - reportDate);
                daysOld = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 

                if (daysOld >= 3 && statusText !== 'Resolved' && statusText !== 'Rejected') {
                    isOverdue = true;
                    overdueBadge = `
                        <span style="background-color: #fee2e2; color: #dc2626; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; margin-top: 4px; display: inline-flex; align-items: center; gap: 4px;">
                            ⚠️ ${daysOld} Days Overdue
                        </span>`;
                }
            }

            const row = `
                <tr data-date="${isoDate}">
                    <td style="font-weight: bold; color: var(--text-secondary);" title="${data.report_id || id}">${shortId}</td>
                    <td style="font-weight: 500;">${type}</td>
                    <td style="font-weight: 500;">${prediction.replace('_', ' ')}</td>
                    <td>${address}</td>
                    <td style="font-weight: 500;">${wmoName}</td>
                    <td>
                        <div style="display: flex; flex-direction: column; align-items: flex-start;">
                            <span class="status-badge ${statusClass}">
                                <span class="status-dot"></span>
                                ${statusText}
                            </span>
                            ${overdueBadge}
                        </div>
                    </td>
                    <td><span style="font-size: 0.85rem; color: var(--text-secondary);">${displayDate}</span></td>
                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="window.openReportModal('${id}')">Review / Assign</button>
                    </td>
                </tr>
            `;
            tableBody.innerHTML += row;
        });
        
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
        showPopupMessage("There are no WMO officers available in the system!", "error");
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
        showPopupMessage("Could not detect a specific Presint in the report's address to auto-assign.", "error");
        return;
    }

    const matchingWMOs = wmoList.filter(wmo => {
        const wmoCoverage = (wmo.presint || '').toLowerCase();
        const regex = new RegExp(`\\b${detectedPresintNum}\\b`);
        return regex.test(wmoCoverage);
    });

    if (matchingWMOs.length === 0) {
        showPopupMessage(`No WMO officer found covering Presint ${detectedPresintNum}.`, "error");
        return;
    }

    const sortedWMOs = matchingWMOs.sort((a, b) => {
        return (a['Assigned Reports'] || 0) - (b['Assigned Reports'] || 0);
    });

    const selectedWMO = sortedWMOs[0]; 
    document.getElementById('modalWmoSelect').value = selectedWMO.id;
    
    showPopupMessage(`Smart Assign: Selected ${selectedWMO.name} because they cover Presint ${detectedPresintNum}.`, "success");
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
        showPopupMessage("Report updated successfully!", "success");
        
    } catch (error) {
        console.error("Error updating report:", error);
        showPopupMessage("Failed to update: " + error.message, "error");
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
    // 1. Open custom modal when delete is clicked
    deleteReportBtn.addEventListener('click', () => {
        if (!currentEditingReportId) return;
        window.openModal('deleteConfirmModal');
    });
}

// 2. Handle actual deletion when "Delete" is clicked on the custom modal
document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    if (!currentEditingReportId) return;

    const btn = document.getElementById('confirmDeleteBtn');
    const originalText = btn.innerText;
    btn.innerText = "Deleting...";
    btn.disabled = true;

    try {
        await deleteDoc(doc(db, 'reports', currentEditingReportId));
        
        window.closeModal('deleteConfirmModal');
        window.closeModal('reportModal');
        
        showPopupMessage("Report successfully deleted!", "success");
    } catch (error) {
        console.error("Error deleting report:", error);
        showPopupMessage("Failed to delete: " + error.message, "error");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});


// ==========================================
// 6. SEARCH & FILTER LOGIC
// ==========================================
function filterTable() {
    let searchValue = document.getElementById("reportSearch").value.toLowerCase();
    let statusFilter = document.getElementById("statusFilter").value.toLowerCase();
    let dateFilter = document.getElementById("dateFilter").value; 
    let rows = document.querySelectorAll("#reportsTableBody tr");

    rows.forEach(row => {
        if (row.innerText.includes("Loading") || row.innerText.includes("No reports")) return;
        
        let rowText = row.textContent.toLowerCase();
        let matchesSearch = rowText.includes(searchValue);
        
        let matchesStatus = false;
        if (statusFilter === 'overdue') {
            matchesStatus = rowText.includes('overdue');
        } else {
            matchesStatus = statusFilter === "" || rowText.includes(statusFilter);
        }
        
        let rowDate = row.getAttribute("data-date") || "";
        let matchesDate = dateFilter === "" || rowDate === dateFilter;

        row.style.display = (matchesSearch && matchesStatus && matchesDate) ? "" : "none";
    });
}

document.getElementById("reportSearch").addEventListener("keyup", filterTable);
document.getElementById("statusFilter").addEventListener("change", filterTable);
document.getElementById("dateFilter").addEventListener("change", filterTable);