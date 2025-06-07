
// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc, query, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- CONFIGURATION & INITIALIZATION ---
// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: import.meta.env.VITE_API_KEY,
    authDomain: import.meta.env.VITE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_APP_ID
};

const appId = import.meta.env.VITE_PROJECT_ID; // Use projectId as the appId for consistency

setLogLevel('debug');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let userId = null;
let inventoryCollectionRef = null;
let unsubscribe = null;

let allItems = [];

// --- AUTHENTICATION ---
onAuthStateChanged(auth, user => {
    const authStatusDiv = document.getElementById('auth-status');
    if (user) {
        console.log("User is signed in with UID:", user.uid);
        userId = user.uid;
        authStatusDiv.innerHTML = `User ID: <span class="font-mono">${userId}</span>`;
        inventoryCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory'); // for a shared database
        loadInventory();
    } else {
        console.log("User is signed out.");
        userId = null;
        authStatusDiv.textContent = 'Not signed in.';
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
        clearUI();
    }
});

async function signIn() {
    try {
        await signInAnonymously(auth);
        console.log("Signed in anonymously.");
    } catch (error) {
        console.error("Authentication Error:", error);
        // ... rest of the function
    }
}
document.getElementById('auth-status').textContent = 'Authentication failed. Please refresh.';
showModal('Error', 'Could not sign in to save your data.');
                }
            }

// --- DATA HANDLING & UI RENDERING ---

function loadInventory() {
    const loadingState = document.getElementById('loading-state');
    const emptyState = document.getElementById('empty-state');

    loadingState.style.display = 'block';
    emptyState.style.display = 'none';

    if (unsubscribe) unsubscribe();

    const q = query(inventoryCollectionRef);
    unsubscribe = onSnapshot(q, (snapshot) => {
        loadingState.style.display = 'none';
        allItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allItems.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        document.getElementById('empty-state').style.display = allItems.length === 0 ? 'block' : 'none';

        updateSuggestions(allItems);
        applyFilters();
    }, (error) => {
        console.error("Error fetching inventory: ", error);
        showModal('Error', 'Could not load your inventory data.');
        loadingState.style.display = 'none';
    });
}

function renderInventory(items) {
    const list = document.getElementById('inventory-list');
    list.innerHTML = '';
    if (items.length === 0 && allItems.length > 0) {
        list.innerHTML = `<div class="md:col-span-2 text-center py-5 text-gray-500">No items match your current filters.</div>`;
    } else {
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'bg-gray-50 p-4 rounded-lg shadow-sm border border-gray-200 flex space-x-4 card-enter';

            const placeholderImg = `https://placehold.co/100x100/e0e7ff/4f46e5?text=${item.name.charAt(0)}`;
            const imgSrc = item.photo_base64 || placeholderImg;

            let expirationHTML = '';
            if (item.expirationDate) {
                const status = getExpirationStatus(item.expirationDate);
                if (status) {
                    expirationHTML = `<p class="text-sm ${status.colorClass}">${status.text}</p>`;
                }
            }

            card.innerHTML = `
                            <img src="${imgSrc}" alt="${item.name}" class="w-24 h-24 rounded-md object-cover flex-shrink-0 bg-gray-200">
                            <div class="flex-grow">
                                <h3 class="font-bold text-lg text-indigo-800">${escapeHTML(item.name)}</h3>
                                <p class="text-sm text-gray-600"><span class="font-semibold">Room:</span> ${escapeHTML(item.room)}</p>
                                <p class="text-sm text-gray-600"><span class="font-semibold">Container:</span> ${escapeHTML(item.container) || 'N/A'}</p>
                                <p class="text-sm text-gray-600"><span class="font-semibold">Category:</span> ${escapeHTML(item.category) || 'N/A'}</p>
                                ${expirationHTML}
                                <div class="mt-2">
                                    <button data-id="${item.id}" class="edit-btn text-xs text-indigo-600 hover:text-indigo-800 font-medium mr-3">Edit</button>
                                    <button data-id="${item.id}" class="delete-btn text-xs text-red-600 hover:text-red-800 font-medium">Delete / Consume</button>
                                </div>
                            </div>
                        `;
            list.appendChild(card);
            requestAnimationFrame(() => card.classList.add('card-enter-active'));
        });
    }

    document.querySelectorAll('.edit-btn').forEach(button => button.addEventListener('click', handleEditClick));
    document.querySelectorAll('.delete-btn').forEach(button => button.addEventListener('click', handleDeleteClick));
}

function clearUI() {
    document.getElementById('inventory-list').innerHTML = '';
    document.getElementById('empty-state').style.display = 'block';
    ['room', 'container', 'category'].forEach(type => {
        document.getElementById(`filter-${type}`).innerHTML = `<option value="">All ${type.charAt(0).toUpperCase() + type.slice(1)}s</option>`;
        document.getElementById(`${type}-suggestions`).innerHTML = '';
    });
}

function updateSuggestions(items) {
    const rooms = new Set(items.map(i => i.room).filter(Boolean));
    const containers = new Set(items.map(i => i.container).filter(Boolean));
    const categories = new Set(items.map(i => i.category).filter(Boolean));

    populateDatalist('room-suggestions', rooms);
    populateDatalist('container-suggestions', containers);
    populateDatalist('category-suggestions', categories);

    populateSelect('filter-room', rooms, 'All Rooms');
    populateSelect('filter-container', containers, 'All Containers');
    populateSelect('filter-category', categories, 'All Categories');
}

function populateDatalist(id, dataSet) {
    const datalist = document.getElementById(id);
    datalist.innerHTML = '';
    [...dataSet].sort().forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        datalist.appendChild(option);
    });
}

function populateSelect(id, dataSet, defaultOptionText) {
    const select = document.getElementById(id);
    const currentValue = select.value;
    select.innerHTML = `<option value="">${defaultOptionText}</option>`;
    [...dataSet].sort().forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
    if (currentValue && dataSet.has(currentValue)) {
        select.value = currentValue;
    }
}

function applyFilters() {
    const searchTerm = document.getElementById('filter-search').value.toLowerCase();
    const room = document.getElementById('filter-room').value;
    const container = document.getElementById('filter-container').value;
    const category = document.getElementById('filter-category').value;

    const filteredItems = allItems.filter(item =>
        item.name.toLowerCase().includes(searchTerm) &&
        (!room || item.room === room) &&
        (!container || item.container === container) &&
        (!category || item.category === category)
    );

    renderInventory(filteredItems);
}

// --- EVENT HANDLERS ---

document.getElementById('add-item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!userId) {
        showModal('Error', 'You must be signed in to add items.');
        return;
    }

    const submitButton = document.getElementById('submit-button');
    submitButton.disabled = true;
    submitButton.textContent = 'Adding...';

    try {
        const newItem = {
            name: document.getElementById('item-name').value,
            category: document.getElementById('item-category').value,
            room: document.getElementById('item-room').value,
            container: document.getElementById('item-container').value,
            expirationDate: document.getElementById('item-expiration').value,
            createdAt: new Date()
        };

        const photoFile = document.getElementById('item-photo').files[0];
        if (photoFile) {
            newItem.photo_base64 = await resizeAndEncodeImage(photoFile);
        }

        await addDoc(inventoryCollectionRef, newItem);

        e.target.reset();
        document.getElementById('image-preview').classList.add('hidden');
        document.getElementById('expiration-date-wrapper').classList.add('hidden');
        showModal('Success', `Item "${newItem.name}" has been added.`);

    } catch (error) {
        console.error("Error adding document: ", error);
        showModal('Error', 'Failed to add item. Please try again.');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Add Item';
    }
});

function handleDeleteClick(e) {
    const itemId = e.target.dataset.id;
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    showConfirm(
        'Delete Item',
        `Are you sure you want to delete/consume "${escapeHTML(item.name)}"? This cannot be undone.`,
        async () => {
            try {
                await deleteDoc(doc(inventoryCollectionRef, itemId));
                console.log("Item deleted:", itemId);
                showModal('Success', `"${escapeHTML(item.name)}" was deleted.`);
            } catch (error) {
                console.error("Error deleting item:", error);
                showModal('Error', 'Failed to delete item.');
            }
        }
    );
}

function handleEditClick(e) {
    const itemId = e.target.dataset.id;
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;

    document.getElementById('edit-item-id').value = item.id;
    document.getElementById('edit-item-name').value = item.name || '';
    document.getElementById('edit-item-category').value = item.category || '';
    document.getElementById('edit-item-room').value = item.room || '';
    document.getElementById('edit-item-container').value = item.container || '';
    document.getElementById('edit-item-expiration').value = item.expirationDate || '';

    toggleExpirationField('edit-expiration-date-wrapper', item.category);

    document.getElementById('edit-modal').classList.remove('hidden');
}

document.getElementById('edit-item-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const itemId = document.getElementById('edit-item-id').value;
    if (!itemId) return;

    const updateButton = document.getElementById('update-item-button');
    updateButton.disabled = true;
    updateButton.textContent = 'Updating...';

    const updatedData = {
        name: document.getElementById('edit-item-name').value,
        category: document.getElementById('edit-item-category').value,
        room: document.getElementById('edit-item-room').value,
        container: document.getElementById('edit-item-container').value,
        expirationDate: document.getElementById('edit-item-expiration').value,
    };

    try {
        const itemRef = doc(inventoryCollectionRef, itemId);
        await updateDoc(itemRef, updatedData);
        document.getElementById('edit-modal').classList.add('hidden');
        showModal('Success', `"${updatedData.name}" has been updated.`);
    } catch (error) {
        console.error("Error updating item: ", error);
        showModal('Error', "Failed to update item.");
    } finally {
        updateButton.disabled = false;
        updateButton.textContent = 'Update Item';
    }
});

document.getElementById('item-photo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const preview = document.getElementById('image-preview');
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => { preview.src = e.target.result; preview.classList.remove('hidden'); }
        reader.readAsDataURL(file);
    } else {
        preview.classList.add('hidden');
    }
});

const toggleExpirationField = (wrapperId, categoryValue) => {
    const wrapper = document.getElementById(wrapperId);
    if (categoryValue && categoryValue.toLowerCase().trim() === 'food') {
        wrapper.classList.remove('hidden');
    } else {
        wrapper.classList.add('hidden');
        wrapper.querySelector('input').value = '';
    }
};

document.getElementById('item-category').addEventListener('input', (e) => toggleExpirationField('expiration-date-wrapper', e.target.value));
document.getElementById('edit-item-category').addEventListener('input', (e) => toggleExpirationField('edit-expiration-date-wrapper', e.target.value));
document.getElementById('edit-modal-cancel').addEventListener('click', () => document.getElementById('edit-modal').classList.add('hidden'));

['filter-search', 'filter-room', 'filter-container', 'filter-category'].forEach(id => {
    document.getElementById(id).addEventListener('input', applyFilters);
});

// --- UTILITY FUNCTIONS ---

function getExpirationStatus(dateString) {
    if (!dateString) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const parts = dateString.split('-').map(Number);
    const expDate = new Date(parts[0], parts[1] - 1, parts[2]);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: `Expired ${-diffDays} day(s) ago`, colorClass: 'text-red-600 font-bold' };
    if (diffDays === 0) return { text: 'Expires Today!', colorClass: 'text-red-500 font-semibold' };
    if (diffDays <= 7) return { text: `Expires in ${diffDays} day(s)`, colorClass: 'text-yellow-600 font-semibold' };
    return { text: `Expires: ${expDate.toLocaleDateString()}`, colorClass: 'text-gray-500' };
}

function escapeHTML(str) {
    return str ? new DOMParser().parseFromString(str, 'text/html').body.textContent : '';
}

function showModal(title, message) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    document.getElementById('modal').classList.remove('hidden');
}
document.getElementById('modal-close').addEventListener('click', () => document.getElementById('modal').classList.add('hidden'));

function showConfirm(title, message, onOk) {
    const modal = document.getElementById('confirm-modal');
    modal.querySelector('#confirm-title').textContent = title;
    modal.querySelector('#confirm-message').innerHTML = message; // Use innerHTML for escaped item names

    const confirmBtn = modal.querySelector('#confirm-ok');
    const cancelBtn = modal.querySelector('#confirm-cancel');

    // Clone and replace to remove old event listeners
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', () => {
        onOk();
        modal.classList.add('hidden');
    });

    cancelBtn.onclick = () => modal.classList.add('hidden');
    modal.classList.remove('hidden');
}

function resizeAndEncodeImage(file, maxWidth = 500, maxHeight = 500) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                if (width > height) { if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } }
                else { if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; } }
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = reject;
            img.src = event.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function exportToCSV() {
    if (allItems.length === 0) {
        showModal('Info', 'There is no inventory data to export.');
        return;
    }

    const headers = ['ID', 'Name', 'Category', 'Room', 'Container', 'ExpirationDate', 'CreatedAt'];
    const csvRows = [headers.join(',')];

    for (const item of allItems) {
        const createdAt = item.createdAt?.toDate ? item.createdAt.toDate().toISOString() : '';
        const values = [
            item.id,
            `"${(item.name || '').replace(/"/g, '""')}"`,
            `"${(item.category || '').replace(/"/g, '""')}"`,
            `"${(item.room || '').replace(/"/g, '""')}"`,
            `"${(item.container || '').replace(/"/g, '""')}"`,
            item.expirationDate || '',
            createdAt
        ];
        csvRows.push(values.join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const date = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `home-inventory-${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);

// --- INITIALIZATION ---
signIn();