import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// إعدادات فايربيس (حجاريا)
const firebaseConfig = {
  apiKey: "AIzaSyBtj65b-J9L7Oxf3iR1EE5tinF5FahVLpw",
  authDomain: "hujariya-1.firebaseapp.com",
  projectId: "hujariya-1",
  storageBucket: "hujariya-1.firebasestorage.app",
  messagingSenderId: "983562756581",
  appId: "1:983562756581:web:71ede7b120b50af894cf0c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const IMGBB_API_KEY = "E9d57b2ba79217bb8bde762b332b7c62".trim().toLowerCase();
const ADMIN_EMAILS = ["rawialshamal@gmail.com", "a1hmedrashad@gmail.com"];

function isUserAdmin(user) {
    return user && user.email && ADMIN_EMAILS.includes(user.email.trim().toLowerCase());
}

// متغيرات النظام
let currentUser = null;
let isAdmin = false;
let allBooks = [];
let userFavorites = [];
let currentCategory = "all";

// 1. نظام الوضع الليلي (Dark Mode)
const darkModeToggle = document.getElementById('darkModeToggle');
const body = document.body;

// التحقق من الإعداد المحفوظ مسبقاً
if (localStorage.getItem('hujariya_theme') === 'dark') {
    body.classList.replace('light-mode', 'dark-mode');
    darkModeToggle.checked = true;
}

darkModeToggle.addEventListener('change', () => {
    if (darkModeToggle.checked) {
        body.classList.replace('light-mode', 'dark-mode');
        localStorage.setItem('hujariya_theme', 'dark');
    } else {
        body.classList.replace('dark-mode', 'light-mode');
        localStorage.setItem('hujariya_theme', 'light');
    }
});

// 2. نظام التنقل في الشريط السفلي (Bottom Nav)
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view-section');

navItems.forEach(item => {
    item.addEventListener('click', () => {
        // إزالة التفعيل من كل الأزرار والصفحات
        navItems.forEach(nav => nav.classList.remove('active'));
        views.forEach(view => view.classList.remove('active-view'));
        
        // تفعيل الزر والصفحة المطلوبة
        item.classList.add('active');
        const targetView = document.getElementById(item.getAttribute('data-target'));
        if(targetView) targetView.classList.add('active-view');
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});

// 3. إدارة تسجيل الدخول (في صفحة الحساب)
const authActionBtn = document.getElementById('authActionBtn');
const profileName = document.getElementById('profileName');
const profileEmail = document.getElementById('profileEmail');
const profileAvatar = document.getElementById('profileAvatar');
const adminNavBtn = document.getElementById('adminNavBtn');
const adminSettingsGroup = document.getElementById('adminSettingsGroup');

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    isAdmin = isUserAdmin(user);

    if (user) {
        authActionBtn.innerHTML = "<i class='bx bx-log-out'></i> تسجيل الخروج";
        authActionBtn.classList.replace('btn-primary', 'btn-danger');
        profileName.innerHTML = isAdmin ? `${user.displayName} <i class='bx bxs-badge-check' style='color:var(--accent-color)'></i>` : user.displayName;
        profileEmail.textContent = user.email;
        profileAvatar.src = user.photoURL || "https://ui-avatars.com/api/?name=User";

        adminNavBtn.style.display = isAdmin ? "flex" : "none";
        adminSettingsGroup.style.display = isAdmin ? "block" : "none";

        await loadUserProfileData(user.uid);
    } else {
        authActionBtn.innerHTML = "<i class='bx bxl-google'></i> تسجيل الدخول بجوجل";
        authActionBtn.classList.replace('btn-danger', 'btn-primary');
        profileName.textContent = "زائر";
        profileEmail.textContent = "يرجى تسجيل الدخول للوصول لكافة الميزات";
        profileAvatar.src = "https://ui-avatars.com/api/?name=User&background=random&color=fff";
        
        adminNavBtn.style.display = "none";
        adminSettingsGroup.style.display = "none";
        userFavorites = [];
        
        // العودة للرئيسية عند تسجيل الخروج
        document.querySelector('[data-target="shelvesView"]').click();
    }
    renderAllViews();
});

authActionBtn.addEventListener('click', () => {
    if (currentUser) {
        signOut(auth);
    } else {
        signInWithPopup(auth, new GoogleAuthProvider()).catch(console.error);
    }
});

async function loadUserProfileData(uid) {
    try {
        const userRef = doc(db, "users", uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
            userFavorites = snap.data().favorites || [];
        } else {
            await setDoc(userRef, { favorites: [] });
        }
    } catch (e) { console.error(e); }
}

// 4. نظام تبويبات التصنيفات والبحث الذكي
const catTabs = document.querySelectorAll('.cat-tab');
const searchInput = document.getElementById('searchInput');

catTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        catTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentCategory = tab.getAttribute('data-cat');
        renderMainShelves();
        // تمرير التبويب للمنتصف بسلاسة
        tab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
});

searchInput.addEventListener('input', renderMainShelves);

// 5. جلب الكتب من فايربيس وعرضها
async function fetchBooksFromFirestore() {
    try {
        const snap = await getDocs(collection(db, "books"));
        allBooks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allBooks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        renderAllViews();
    } catch (error) {
        console.error("خطأ جلب الكتب:", error);
    }
}

function renderAllViews() {
    renderMainShelves();
    if (currentUser) renderMyLibrary();
    if (isAdmin) renderAdminList();
}

// عرض الرفوف الرئيسية (بحث + تصفية)
function renderMainShelves() {
    const searchVal = searchInput.value.trim().toLowerCase();
    const shelf = document.getElementById("mainBookshelf");
    shelf.innerHTML = "";

    const published = allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download");
    
    const filtered = published.filter(b => {
        const matchSearch = (b.title || "").toLowerCase().includes(searchVal) || (b.author || "").toLowerCase().includes(searchVal);
        const matchCat = currentCategory === "all" || b.category === currentCategory;
        return matchSearch && matchCat;
    });

    document.getElementById("booksCountText").textContent = `${filtered.length} كتاب`;

    if (filtered.length === 0) {
        shelf.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:var(--text-muted);">لا توجد نتائج مطابقة.</div>`;
        return;
    }

    filtered.forEach(book => shelf.appendChild(createBookCard(book)));
}

// تصميم بطاقة الكتاب الحديثة
function createBookCard(book) {
    const card = document.createElement('div');
    card.className = 'book-card';
    const rating = book.ratingCount > 0 ? (book.ratingSum / book.ratingCount).toFixed(1) : "جديد";
    
    card.innerHTML = `
        <img src="${book.coverUrl}" alt="${book.title}" class="book-cover" loading="lazy">
        <div class="book-info">
            <h4 class="book-title">${book.title}</h4>
            <div class="book-author"><i class='bx bx-pen'></i> ${book.author}</div>
            <div class="book-meta">
                <span class="book-rating"><i class='bx bxs-star'></i> ${rating}</span>
                <span style="color:var(--accent-color); font-size:0.75rem;">${book.category}</span>
            </div>
        </div>
    `;
    card.onclick = () => openBookDetails(book);
    return card;
}

// 6. رفع الكتب (المودال العائم)
const addBookModal = document.getElementById('addBookModal');
document.getElementById('openAddModalBtn').onclick = () => {
    if(!currentUser) {
        alert("يرجى تسجيل الدخول أولاً للمساهمة بكتاب.");
        document.querySelector('[data-target="profileView"]').click();
        return;
    }
    addBookModal.style.display = 'flex';
};
document.getElementById('closeAddModal').onclick = () => addBookModal.style.display = 'none';

document.getElementById('submitBookBtn').onclick = async () => {
    const title = document.getElementById("bookTitleInput").value.trim();
    const author = document.getElementById("bookAuthorInput").value.trim();
    const category = document.getElementById("bookCategoryInput").value;
    const desc = document.getElementById("bookDescInput").value.trim();
    const driveLink = document.getElementById("bookDriveInput").value.trim();
    const coverFile = document.getElementById("bookCoverInput").files[0];
    const statusMsg = document.getElementById("uploadStatusMsg");
    
    if (!title || !author || !desc || !coverFile) {
        statusMsg.innerHTML = "<i class='bx bx-error-circle'></i> يرجى تعبئة الحقول الأساسية وإرفاق الغلاف.";
        statusMsg.style.color = "var(--danger-color)";
        return;
    }

    statusMsg.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> جاري الرفع ومعالجة البيانات...";
    statusMsg.style.color = "var(--text-main)";

    try {
        const formData = new FormData();
        formData.append("image", coverFile);
        const imgRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
        const imgData = await imgRes.json();

        if (!imgData.success) throw new Error("فشل رفع الغلاف.");

        const initialStatus = isAdmin ? (driveLink ? "published_full" : "published_no_download") : "pending";

        await addDoc(collection(db, "books"), {
            title, author, category, description: desc, downloadLink: driveLink,
            coverUrl: imgData.data.url, status: initialStatus,
            addedByUid: currentUser.uid, addedByName: currentUser.displayName,
            ratingSum: 0, ratingCount: 0, createdAt: Date.now()
        });

        statusMsg.innerHTML = isAdmin ? "<i class='bx bx-check-circle'></i> تم النشر بنجاح!" : "<i class='bx bx-check-circle'></i> تم الإرسال للمراجعة بنجاح!";
        statusMsg.style.color = "#28a745";
        
        setTimeout(() => {
            addBookModal.style.display = 'none';
            statusMsg.innerHTML = "";
            fetchBooksFromFirestore();
        }, 1500);

    } catch (e) {
        statusMsg.innerHTML = "<i class='bx bx-error-circle'></i> حدث خطأ، حاول مجدداً.";
        statusMsg.style.color = "var(--danger-color)";
    }
};

// 7. عرض تفاصيل الكتاب
const bookDetailsModal = document.getElementById('bookDetailsModal');
document.getElementById('closeDetailsModal').onclick = () => bookDetailsModal.style.display = 'none';

function openBookDetails(book) {
    const isFav = userFavorites.includes(book.id);
    const body = document.querySelector('.book-details-body');
    
    let html = `
        <div class="book-details-header">
            <img src="${book.coverUrl}" class="book-details-cover">
            <div class="book-details-info">
                <span class="book-badge">${book.category}</span>
                <h2>${book.title}</h2>
                <p><i class='bx bx-pen'></i> ${book.author}</p>
                <p><i class='bx bxs-star' style="color:#f39c12"></i> ${book.ratingCount > 0 ? (book.ratingSum/book.ratingCount).toFixed(1) : 'جديد'}</p>
            </div>
        </div>
        <div class="book-details-desc">${book.description}</div>
        
        <div style="display:flex; gap:10px; margin-bottom:15px;">
            <button id="favActionBtn" class="btn-primary" style="flex:1; background:${isFav ? 'var(--danger-color)' : 'var(--primary-color)'}">
                <i class='bx ${isFav ? 'bx-bookmark-minus' : 'bx-bookmark-plus'}'></i> ${isFav ? 'إزالة من مكتبتي' : 'حفظ في مكتبتي'}
            </button>
            ${book.status === 'published_full' && book.downloadLink ? 
            `<a href="${getDirectDriveDownloadUrl(book.downloadLink)}" target="_blank" class="btn-primary" style="flex:1; background:var(--accent-color); text-decoration:none;">
                <i class='bx bx-cloud-download'></i> تحميل
            </a>` : 
            `<div class="btn-primary" style="flex:1; background:#6c757d; cursor:not-allowed; opacity:0.8;">
                <i class='bx bx-lock-alt'></i> للمراجعة فقط
            </div>`}
        </div>
    `;

    // لوحة تحكم الإدارة داخل تفاصيل الكتاب
    if (isAdmin) {
        html += `
            <div style="margin-top:20px; padding:15px; border:1px dashed var(--danger-color); border-radius:10px;">
                <h4 style="color:var(--danger-color); margin-bottom:10px;"><i class='bx bx-shield-quarter'></i> أدوات الإدارة</h4>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <button class="btn-primary" style="background:#000;" id="adminToggleStatus">
                        <i class='bx bx-transfer'></i> ${book.status === 'published_full' ? 'تحويل لموسوعي (بدون تحميل)' : 'تفعيل التحميل المباشر'}
                    </button>
                    <button class="btn-danger" id="adminDeleteBook"><i class='bx bx-trash'></i> حذف الكتاب نهائياً</button>
                </div>
            </div>
        `;
    }

    body.innerHTML = html;
    
    // أحداث أزرار التفاصيل
    document.getElementById('favActionBtn').onclick = async () => {
        if (!currentUser) return alert("سجل دخولك أولاً!");
        if (isFav) userFavorites = userFavorites.filter(id => id !== book.id);
        else userFavorites.push(book.id);
        await updateDoc(doc(db, "users", currentUser.uid), { favorites: userFavorites });
        openBookDetails(book); // تحديث الواجهة
        renderAllViews();
    };

    if(isAdmin) {
        document.getElementById('adminToggleStatus').onclick = async () => {
            const newStatus = book.status === 'published_full' ? 'published_no_download' : 'published_full';
            await updateDoc(doc(db, "books", book.id), { status: newStatus });
            bookDetailsModal.style.display = 'none';
            fetchBooksFromFirestore();
        };
        document.getElementById('adminDeleteBook').onclick = async () => {
            if(confirm('متأكد من الحذف؟')) {
                await deleteDoc(doc(db, "books", book.id));
                bookDetailsModal.style.display = 'none';
                fetchBooksFromFirestore();
            }
        };
    }

    bookDetailsModal.style.display = 'flex';
}

function getDirectDriveDownloadUrl(url) {
    if (!url) return "";
    const matchId = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (matchId && matchId[1]) return `https://drive.google.com/uc?export=download&id=${matchId[1]}`;
    return url;
}

// 8. مكتبتي (حفظ)
function renderMyLibrary() {
    const shelf = document.getElementById("savedBooksShelf");
    shelf.innerHTML = "";
    const favs = allBooks.filter(b => userFavorites.includes(b.id));
    
    if (favs.length === 0) {
        shelf.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">لم تحفظ أي كتاب بعد.</div>`;
        return;
    }
    favs.forEach(b => shelf.appendChild(createBookCard(b)));
}

// 9. لوحة الإدارة
document.getElementById('goToAdminPanelBtn').onclick = () => document.getElementById('adminNavBtn').click();

function renderAdminList() {
    const pendingBooks = allBooks.filter(b => b.status === "pending");
    document.getElementById("pendingBadge").textContent = pendingBooks.length;
    const list = document.getElementById("pendingBooksList");
    list.innerHTML = "";

    if (pendingBooks.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">لا توجد طلبات جديدة.</div>`;
        return;
    }

    pendingBooks.forEach(book => {
        const item = document.createElement('div');
        item.style.cssText = "display:flex; gap:15px; background:var(--surface-color); padding:15px; border-radius:10px; margin-bottom:15px; box-shadow:var(--shadow-sm); border:1px solid var(--border-color);";
        item.innerHTML = `
            <img src="${book.coverUrl}" style="width:70px; height:100px; object-fit:cover; border-radius:6px;">
            <div style="flex:1;">
                <h4 style="margin-bottom:5px; color:var(--text-main);">${book.title}</h4>
                <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:10px;">${book.author} | رفع بواسطة: ${book.addedByName}</p>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn-primary approve-full" style="padding:6px 12px; font-size:0.8rem;"><i class='bx bx-check'></i> نشر بتحميل</button>
                    <button class="btn-primary approve-no-dl" style="padding:6px 12px; font-size:0.8rem; background:var(--accent-color);"><i class='bx bx-book-open'></i> موسوعي فقط</button>
                    <button class="btn-danger reject-book" style="padding:6px 12px; font-size:0.8rem;"><i class='bx bx-trash'></i> رفض</button>
                </div>
            </div>
        `;

        item.querySelector('.approve-full').onclick = async () => {
            await updateDoc(doc(db, "books", book.id), { status: "published_full" });
            fetchBooksFromFirestore();
        };
        item.querySelector('.approve-no-dl').onclick = async () => {
            await updateDoc(doc(db, "books", book.id), { status: "published_no_download", downloadLink: "" });
            fetchBooksFromFirestore();
        };
        item.querySelector('.reject-book').onclick = async () => {
            if(confirm("رفض وحذف الكتاب؟")) {
                await deleteDoc(doc(db, "books", book.id));
                fetchBooksFromFirestore();
            }
        };
        list.appendChild(item);
    });
}

// 10. إعداد تثبيت التطبيق (PWA)
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('installAppBtn');
    installBtn.style.display = 'flex';
    installBtn.addEventListener('click', async () => {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') installBtn.style.display = 'none';
        deferredPrompt = null;
    });
});

// بدء التشغيل
fetchBooksFromFirestore();
