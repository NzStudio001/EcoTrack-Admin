// js/feedback.js

import { db, auth } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import { collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

// Cache to store user names so we can display real names instead of raw IDs
let usersCache = {};

// ==========================================
// 1. WAIT FOR SECURE AUTHENTICATION
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        loadUsersThenFeedback();
    }
});

// ==========================================
// 2. FETCH USERS FIRST, THEN FEEDBACK
// ==========================================
function loadUsersThenFeedback() {
    // 1st Listener: Get User Names
    onSnapshot(collection(db, 'users'), (snapshot) => {
        usersCache = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            // Fallback to UID if name is missing
            usersCache[doc.id] = data.name || data.uid || 'Citizen'; 
        });
        
        // After users are loaded, fetch the feedback
        loadFeedbackData();
    });
}

function loadFeedbackData() {
    // 2nd Listener: Get Feedback ordered by newest first
    const q = query(collection(db, 'user_feedback'), orderBy('created_at', 'desc'));
    
    onSnapshot(q, (snapshot) => {
        const tableBody = document.getElementById('feedbackTableBody');
        tableBody.innerHTML = '';

        let totalFeedback = snapshot.size;
        let sumRating = 0;
        let positiveCount = 0;

        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No feedback found yet.</td></tr>';
            updateStats(0, 0, 0);
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            
            // --- MATH CALCULATIONS ---
            const rating = data.rating || 0;
            sumRating += rating;
            if (rating >= 4) positiveCount++; // 4 and 5 stars are considered "Positive"

            // --- DATA FORMATTING ---
            const userId = data.user_id || 'Unknown';
            const userName = usersCache[userId] || 'Anonymous'; // Map ID to real name
            
            const category = data.category || data.report_type || 'General';
            const feedbackText = data.feedback || '<i style="color: var(--text-secondary);">No comment provided</i>';
            
            // Format Date
            let dateStr = 'Just now';
            if (data.created_at) {
                const date = data.created_at.toDate();
                dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            }

            // Format Visual Stars
            let starsHtml = '';
            for(let i = 0; i < 5; i++) {
                if (i < rating) starsHtml += '⭐';
                else starsHtml += '<span style="opacity: 0.3">⭐</span>'; // Dimmed unearned stars
            }

            // --- HTML ROW GENERATION ---
            const row = `
                <tr>
                    <td style="font-weight: 500;">${userName}</td>
                    <td style="font-size: 1.1rem; letter-spacing: 2px;">${starsHtml}</td>
                    <td><span style="font-weight: 500; color: var(--primary);">${category}</span></td>
                    <td style="color: var(--text-secondary); max-width: 300px; line-height: 1.4;">${feedbackText}</td>
                    <td style="color: var(--text-secondary); font-size: 0.875rem;">${dateStr}</td>
                </tr>
            `;
            tableBody.innerHTML += row;
        });

        // --- UPDATE STAT CARDS ---
        const avgRating = (sumRating / totalFeedback).toFixed(1);
        const posPercentage = Math.round((positiveCount / totalFeedback) * 100);
        updateStats(totalFeedback, avgRating, posPercentage);
    });
}

function updateStats(total, avg, posPercent) {
    document.getElementById('totalFeedback').innerText = total;
    document.getElementById('averageRating').innerText = total > 0 ? avg : '0.0';
    document.getElementById('positiveReviews').innerText = total > 0 ? posPercent + '%' : '0%';
}

// ==========================================
// 3. SEARCH FILTER LOGIC
// ==========================================
document.getElementById("feedbackSearch").addEventListener("keyup", function () {
    let value = this.value.toLowerCase();
    let rows = document.querySelectorAll("#feedbackTableBody tr");

    rows.forEach(row => {
        // Ignore the "Loading" or "No feedback" rows
        if (row.innerText.includes("Loading") || row.innerText.includes("No feedback")) return;
        row.style.display = row.textContent.toLowerCase().includes(value) ? "" : "none";
    });
});