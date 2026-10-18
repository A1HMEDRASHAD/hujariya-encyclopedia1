import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// إعدادات مشروع فايربيس (حجاريا)
const firebaseConfig = {
  apiKey: "AIzaSyBtj65b-J9L7Oxf3iR1EE5tinF5FahVLpw",
  authDomain: "hujariya-1.firebaseapp.com",
  projectId: "hujariya-1",
  storageBucket: "hujariya-1.firebasestorage.app",
  messagingSenderId: "983562756581",
  appId: "1:983562756581:web:71ede7b120b50af894cf0c",
  measurementId: "G-ZE0H1NV0X5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// مفتاح رفع الأغلفة ImgBB وبريد الإدارة المطلقة
const IMGBB_API_KEY = "E9d57b2ba79217bb8bde762b332b7c62".trim().toLowerCase();
const ADMIN_EMAILS = [
    "rawialshamal@gmail.com",
    "a1hmedrashad@gmail.com"
];

function isUserAdmin(user) {
    return Boolean(user && user.email && ADMIN_EMAILS.includes(user.email.trim().toLowerCase()));
}

// متغيرات الحالة
let currentUser = null;
let isAdmin = false;
let allBooks = [];
let allReviews = [];
let userFavorites = [];
let currentCategory = "all";

// دالة تطبيع النصوص العربية لمنع تكرار الكتب لنفس المؤلف بذكاء
function normalizeArabic(text) {
    if (!text) return "";
    return text.trim().toLowerCase()
        .replace(/[\u064B-\u065F]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/^(ال|روايه|رواية|كتاب|ديوان)\s+/g, "")
        .replace(/\s+/g, " ");
}

// تحويل رابط جوجل درايف إلى رابط تحميل مباشر
function toDirectDriveDownload(url) {
    if (!url) return "";
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    return match && match[1] ? `https://drive.google.com/uc?export=download&id=${match[1]}` : url;
}

// 1. إدارة الوضع الليلي والنهاري
const darkModeToggle = document.getElementById("darkModeToggle");
const quickThemeToggle = document.getElementById("quickThemeToggle");

function setThemeMode(isDark) {
    document.body.classList.toggle("dark-mode", isDark);
    document.body.classList.toggle("light-mode", !isDark);
    if (darkModeToggle) darkModeToggle.checked = isDark;
    localStorage.setItem("hujariya_theme", isDark ? "dark" : "light");
}

setThemeMode(localStorage.getItem("hujariya_theme") === "dark");

if (darkModeToggle) {
    darkModeToggle.addEventListener("change", () => setThemeMode(darkModeToggle.checked));
}
if (quickThemeToggle) {
    quickThemeToggle.addEventListener("click", () => setThemeMode(!document.body.classList.contains("dark-mode")));
}

// 2. شريط التنقل السفلي (كبسولة وفقاعة سامسونج)
const navTabs = document.querySelectorAll(".samsung-tab[data-target]");
const viewPages = document.querySelectorAll(".view-page");

function navigateToPage(targetId) {
    navTabs.forEach(tab => tab.classList.toggle("active", tab.getAttribute("data-target") === targetId));
    viewPages.forEach(page => page.classList.toggle("active-page", page.id === targetId));
    window.scrollTo({ top: 0, behavior: "smooth" });
}

navTabs.forEach(tab => {
    tab.addEventListener("click", () => navigateToPage(tab.getAttribute("data-target")));
});

// 3. تسجيل الدخول بجوجل والتحقق من صلاحية الإدارة المطلقة
const authActionBtn = document.getElementById("authActionBtn");
const profileName = document.getElementById("profileName");
const profileEmail = document.getElementById("profileEmail");
const profileAvatar = document.getElementById("profileAvatar");
const adminBadgeIcon = document.getElementById("adminBadgeIcon");
const adminNavBtn = document.getElementById("adminNavBtn");

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    isAdmin = isUserAdmin(user);

    if (user) {
        authActionBtn.innerHTML = `<i class="ri-logout-box-r-line"></i><span>تسجيل الخروج</span>`;
        authActionBtn.style.background = "var(--danger)";
        profileName.textContent = isAdmin ? `${user.displayName} (إدارة الموسوعة)` : user.displayName;
        profileEmail.textContent = user.email;
        profileAvatar.src = user.photoURL || "https://ui-avatars.com/api/?name=U&background=1d352f&color=fff";

        adminBadgeIcon.style.display = isAdmin ? "flex" : "none";
        adminNavBtn.style.display = isAdmin ? "flex" : "none";

        await loadUserFavorites(user.uid);
    } else {
        authActionBtn.innerHTML = `<i class="ri-google-fill"></i><span>تسجيل الدخول عبر جوجل</span>`;
        authActionBtn.style.background = "var(--hujariya-green)";
        profileName.textContent = "زائر الموسوعة";
        profileEmail.textContent = "سجل دخولك بحساب جوجل لحفظ الكتب والمشاركة في التوثيق والتقييم";
        profileAvatar.src = "https://ui-avatars.com/api/?name=H&background=1d352f&color=c28e48";

        adminBadgeIcon.style.display = "none";
        adminNavBtn.style.display = "none";
        userFavorites = [];
    }
    renderAllViews();
});

authActionBtn.addEventListener("click", () => {
    if (currentUser) {
        signOut(auth);
    } else {
        signInWithPopup(auth, new GoogleAuthProvider()).catch(err => {
            alert("يرجى التأكد من تفعيل Google داخل قسم Authentication في فايربيس وإضافة نطاق a1hmedrashad.github.io في Authorized domains.");
            console.error(err);
        });
    }
});

async function loadUserFavorites(uid) {
    try {
        const userRef = doc(db, "users", uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
            userFavorites = snap.data().favorites || [];
        } else {
            await setDoc(userRef, {
                name: currentUser.displayName,
                email: currentUser.email,
                favorites: []
            });
            userFavorites = [];
        }
    } catch (e) {
        console.error("خطأ جلب المفضلة:", e);
    }
}

// 4. جلب الكتب والمراجعات من قاعدة البيانات
async function fetchEncyclopediaData() {
    try {
        const booksSnap = await getDocs(collection(db, "books"));
        allBooks = [];
        booksSnap.forEach(d => {
            const data = d.data();
            if (!data.isConfigDoc) {
                allBooks.push({ id: d.id, ...data });
            }
        });
        allBooks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        const reviewsSnap = await getDocs(collection(db, "reviews"));
        allReviews = reviewsSnap.docs.map(r => ({ id: r.id, ...r.data() }));

        renderAllViews();
    } catch (err) {
        console.error("خطأ في جلب بيانات الموسوعة:", err);
    }
}

function renderAllViews() {
    updateStatisticsBar();
    renderMainBookshelf();
    renderAIRecommendations();
    if (currentUser) renderMyLibraryView();
    if (isAdmin) renderAdminReviewQueue();
}

function updateStatisticsBar() {
    const published = allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download");
    const authorsSet = new Set(published.map(b => normalizeArabic(b.author)).filter(Boolean));
    document.getElementById("statBooksCount").textContent = published.length;
    document.getElementById("statAuthorsCount").textContent = authorsSet.size;
    document.getElementById("statReviewsCount").textContent = allReviews.length;
}

// 5. البحث الذكي وتبويبات التصنيفات السلسة
const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const catChips = document.querySelectorAll(".cat-chip");

searchInput.addEventListener("input", () => {
    clearSearchBtn.style.display = searchInput.value ? "flex" : "none";
    renderMainBookshelf();
});

clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearSearchBtn.style.display = "none";
    renderMainBookshelf();
});

catChips.forEach(chip => {
    chip.addEventListener("click", () => {
        catChips.forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        currentCategory = chip.getAttribute("data-cat");
        chip.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        renderMainBookshelf();
    });
});

function renderMainBookshelf() {
    const q = searchInput.value.trim().toLowerCase();
    const grid = document.getElementById("mainBookshelf");
    grid.innerHTML = "";

    const published = allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download");
    const filtered = published.filter(b => {
        const matchText = !q ||
            (b.title || "").toLowerCase().includes(q) ||
            (b.author || "").toLowerCase().includes(q) ||
            (b.description || "").toLowerCase().includes(q);
        const matchCat = currentCategory === "all" || b.category === currentCategory;
        return matchText && matchCat;
    });

    document.getElementById("shownBooksCount").textContent = `${filtered.length} كتاب`;

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:45px 20px; background:var(--bg-surface); border-radius:16px; border:1px dashed var(--border-color);">
                <i class="ri-book-open-line" style="font-size:2.5rem; color:var(--hujariya-gold);"></i>
                <h4 style="margin:8px 0 4px;">لا توجد كتب مطابقة في هذا التصنيف حالياً</h4>
                <p style="font-size:0.85rem; color:var(--text-muted);">اضغط على «نشر كتاب» في الشريط السفلي لإضافة أول مؤلف يمني!</p>
            </div>
        `;
        return;
    }

    filtered.forEach(book => grid.appendChild(createBookCard(book)));
}

function createBookCard(book, showStatus = false) {
    const card = document.createElement("div");
    card.className = "book-card";

    const avg = book.ratingCount > 0 ? (book.ratingSum / book.ratingCount).toFixed(1) : "جديد";
    const ribbonText = showStatus
        ? (book.status === "pending" ? "قيد المراجعة" : "منشور")
        : book.category;

    card.innerHTML = `
        <div class="book-cover-box">
            <img src="${book.coverUrl}" alt="${book.title}" loading="lazy">
            <span class="book-ribbon">${ribbonText}</span>
        </div>
        <div class="book-card-info">
            <div class="book-card-title">${book.title}</div>
            <div class="book-card-author"><i class="ri-quill-pen-line"></i> ${book.author}</div>
            <div class="book-card-foot">
                <span class="star-rate"><i class="ri-star-fill"></i> ${avg}</span>
                <span style="color:${book.status === 'published_full' && book.downloadLink ? 'var(--success)' : 'var(--hujariya-gold)'};">
                    ${book.status === "published_full" && book.downloadLink ? '<i class="ri-download-2-line"></i> تحميل' : '<i class="ri-chat-3-line"></i> موسوعي'}
                </span>
            </div>
        </div>
    `;
    card.addEventListener("click", () => openBookDetails(book));
    return card;
}

// 6. محرك الذكاء الاصطناعي الخفي للمقترحات الشخصية
function renderAIRecommendations() {
    const aiSection = document.getElementById("aiRecommendationsSection");
    const aiGrid = document.getElementById("aiBooksGrid");

    if (!currentUser || userFavorites.length === 0) {
        aiSection.style.display = "none";
        return;
    }

    const favBooks = allBooks.filter(b => userFavorites.includes(b.id));
    const favCats = new Set(favBooks.map(b => b.category));
    const favAuthors = new Set(favBooks.map(b => normalizeArabic(b.author)));

    const recommended = allBooks.filter(b =>
        (b.status === "published_full" || b.status === "published_no_download") &&
        !userFavorites.includes(b.id) &&
        (favCats.has(b.category) || favAuthors.has(normalizeArabic(b.author)))
    ).slice(0, 4);

    if (recommended.length === 0) {
        aiSection.style.display = "none";
        return;
    }

    aiSection.style.display = "block";
    aiGrid.innerHTML = "";
    recommended.forEach(b => aiGrid.appendChild(createBookCard(b)));
}

// 7. نظام منع تكرار الكتب ورفع كتاب جديد
const addBookModal = document.getElementById("addBookModal");
const bookTitleInput = document.getElementById("bookTitleInput");
const bookAuthorInput = document.getElementById("bookAuthorInput");
const duplicateWarningBox = document.getElementById("duplicateWarningBox");
const bookCoverInput = document.getElementById("bookCoverInput");
const selectedCoverName = document.getElementById("selectedCoverName");

document.getElementById("openAddModalBtn").addEventListener("click", () => {
    if (!currentUser) {
        alert("يرجى تسجيل الدخول بحساب جوجل أولاً للمساهمة بإضافة كتاب.");
        navigateToPage("profileView");
        return;
    }
    addBookModal.style.display = "flex";
});

document.getElementById("closeAddModal").addEventListener("click", () => {
    addBookModal.style.display = "none";
});

bookCoverInput.addEventListener("change", () => {
    if (bookCoverInput.files[0]) {
        selectedCoverName.textContent = `تم اختيار: ${bookCoverInput.files[0].name}`;
    }
});

function checkDuplicateEntry() {
    const normTitle = normalizeArabic(bookTitleInput.value);
    const normAuthor = normalizeArabic(bookAuthorInput.value);
    if (!normTitle || !normAuthor) {
        duplicateWarningBox.style.display = "none";
        return null;
    }
    const existing = allBooks.find(b =>
        normalizeArabic(b.title) === normTitle && normalizeArabic(b.author) === normAuthor
    );
    if (existing) {
        duplicateWarningBox.style.display = "block";
        duplicateWarningBox.innerHTML = `<i class="ri-error-warning-line"></i> مرفوض للتكرار: كتاب «${existing.title}» لنفس الكاتب «${existing.author}» موجود مسبقاً!`;
        return existing;
    }
    duplicateWarningBox.style.display = "none";
    return null;
}

bookTitleInput.addEventListener("input", checkDuplicateEntry);
bookAuthorInput.addEventListener("input", checkDuplicateEntry);

document.getElementById("submitBookBtn").addEventListener("click", async () => {
    const title = bookTitleInput.value.trim();
    const author = bookAuthorInput.value.trim();
    const category = document.getElementById("bookCategoryInput").value;
    const description = document.getElementById("bookDescInput").value.trim();
    const driveLink = document.getElementById("bookDriveInput").value.trim();
    const coverFile = bookCoverInput.files[0];
    const statusEl = document.getElementById("uploadStatusMsg");
    const submitBtn = document.getElementById("submitBookBtn");

    if (!title || !author || !description || !coverFile) {
        statusEl.style.color = "var(--danger)";
        statusEl.textContent = "يرجى تعبئة العنوان والمؤلف والوصف واختيار صورة الغلاف.";
        return;
    }

    if (checkDuplicateEntry()) {
        statusEl.style.color = "var(--danger)";
        statusEl.textContent = "هذا الكتاب مسجل مسبقاً لنفس المؤلف في الموسوعة.";
        return;
    }

    submitBtn.disabled = true;
    statusEl.style.color = "var(--hujariya-gold)";
    statusEl.textContent = "جاري رفع غلاف الكتاب وحفظ البيانات...";

    try {
        const formData = new FormData();
        formData.append("image", coverFile);
        const imgRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: "POST",
            body: formData
        });
        const imgJson = await imgRes.json();
        if (!imgJson.success) throw new Error("تعذر رفع الغلاف");

        const initialStatus = isAdmin ? (driveLink ? "published_full" : "published_no_download") : "pending";

        await addDoc(collection(db, "books"), {
            title,
            author,
            category,
            description,
            downloadLink: driveLink,
            coverUrl: imgJson.data.url,
            status: initialStatus,
            addedByUid: currentUser.uid,
            addedByName: currentUser.displayName,
            addedByEmail: currentUser.email,
            ratingSum: 0,
            ratingCount: 0,
            createdAt: Date.now()
        });

        statusEl.style.color = "var(--success)";
        statusEl.textContent = isAdmin ? "تم نشر الكتاب مباشرة على الرفوف!" : "تم الرفع بنجاح! سيظهر الكتاب فور مراجعته من الإدارة.";

        bookTitleInput.value = "";
        bookAuthorInput.value = "";
        document.getElementById("bookDescInput").value = "";
        document.getElementById("bookDriveInput").value = "";
        bookCoverInput.value = "";
        selectedCoverName.textContent = "اضغط لاختيار صورة الغلاف";

        await fetchEncyclopediaData();
        setTimeout(() => {
            addBookModal.style.display = "none";
            statusEl.textContent = "";
            submitBtn.disabled = false;
        }, 1400);
    } catch (err) {
        statusEl.style.color = "var(--danger)";
        statusEl.textContent = "حدث خطأ أثناء الرفع، حاول مرة أخرى.";
        submitBtn.disabled = false;
    }
});

// 8. نافذة تفاصيل الكتاب + تأكيد التحميل المباشر + المراجعات + تحكم الإدارة
const bookDetailsModal = document.getElementById("bookDetailsModal");
const confirmDownloadModal = document.getElementById("confirmDownloadModal");

document.getElementById("closeDetailsModal").onclick = () => bookDetailsModal.style.display = "none";
document.getElementById("closeConfirmDownload").onclick = () => confirmDownloadModal.style.display = "none";
document.getElementById("cancelDownloadBtn").onclick = () => confirmDownloadModal.style.display = "none";
document.getElementById("confirmDirectDownloadLink").onclick = () => {
    setTimeout(() => confirmDownloadModal.style.display = "none", 400);
};

function openBookDetails(book) {
    const isFav = userFavorites.includes(book.id);
    const avg = book.ratingCount > 0 ? (book.ratingSum / book.ratingCount).toFixed(1) : "جديد";
    const bookReviews = allReviews.filter(r => r.bookId === book.id).sort((a, b) => b.createdAt - a.createdAt);

    const body = document.getElementById("bookDetailsBody");
    body.innerHTML = `
        <div class="detail-header-flex">
            <img src="${book.coverUrl}" class="detail-cover-img" alt="${book.title}">
            <div>
                <span class="tag-gold">${book.category}</span>
                <h2 style="font-family:'Amiri',serif; font-size:1.45rem; margin:6px 0 4px;">${book.title}</h2>
                <p style="color:var(--text-muted); font-weight:700;"><i class="ri-quill-pen-line"></i> المؤلف: ${book.author}</p>
                <p style="color:#e69900; font-weight:700; margin-top:6px;"><i class="ri-star-fill"></i> التقييم العام: ${avg} (${book.ratingCount || 0} تقييم)</p>
            </div>
        </div>

        <div class="detail-desc-box">${book.description}</div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
            <button id="toggleFavModalBtn" class="btn-secondary-action" style="flex:1;">
                <i class="${isFav ? 'ri-bookmark-fill' : 'ri-bookmark-line'}"></i>
                <span>${isFav ? 'محفوظ في مكتبتي' : 'حفظ في مكتبتي'}</span>
            </button>

            ${book.status === "published_full" && book.downloadLink ? `
                <button id="triggerConfirmDownloadBtn" class="btn-primary-action" style="flex:1; background:var(--hujariya-gold);">
                    <i class="ri-download-cloud-2-line"></i>
                    <span>تحميل الكتاب (PDF)</span>
                </button>
            ` : `
                <div style="flex:1; padding:10px; border-radius:10px; background:var(--bg-soft); font-size:0.8rem; text-align:center; font-weight:700; color:var(--text-muted);">
                    <i class="ri-lock-2-line"></i> متاح للمراجعة والنقاش والتوثيق فقط (حقوق محفوظة)
                </div>
            `}
        </div>

        ${isAdmin ? `
            <div style="margin:14px 0; padding:12px; border:1.5px dashed var(--hujariya-gold); border-radius:12px; background:var(--gold-soft);">
                <strong style="display:block; margin-bottom:8px; font-size:0.86rem;"><i class="ri-vip-crown-line"></i> صلاحيات الإدارة المطلقة على الكتاب:</strong>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button id="adminEditBookBtn" class="btn-primary-action" style="padding:7px 12px; font-size:0.8rem;"><i class="ri-edit-line"></i> تعديل البيانات</button>
                    <button id="adminSwitchDlBtn" class="btn-secondary-action" style="padding:7px 12px; font-size:0.8rem;">
                        <i class="ri-refresh-line"></i> ${book.status === 'published_full' ? 'إلغاء التحميل (موسوعي فقط)' : 'تفعيل زر التحميل'}
                    </button>
                    <button id="adminRemoveBookBtn" class="btn-primary-action" style="background:var(--danger); padding:7px 12px; font-size:0.8rem;"><i class="ri-delete-bin-line"></i> حذف نهائي</button>
                </div>
            </div>
        ` : ""}

        <div style="border-top:1px solid var(--border-color); padding-top:14px; margin-top:14px;">
            <h4 style="margin-bottom:10px;"><i class="ri-discuss-line"></i> المراجعات والمناقشات (${bookReviews.length})</h4>
            <div style="display:flex; gap:8px; margin-bottom:10px;">
                <select id="reviewRatingSelect" style="padding:8px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-main); font-weight:700;">
                    <option value="5">5 نجوم</option>
                    <option value="4">4 نجوم</option>
                    <option value="3">3 نجوم</option>
                    <option value="2">نجمتان</option>
                    <option value="1">نجمة</option>
                </select>
                <input type="text" id="reviewCommentField" placeholder="اكتب رأيك أو مراجعتك حول الكتاب..." style="flex:1; padding:8px 12px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-main);">
                <button id="postReviewBtn" class="btn-primary-action" style="padding:8px 14px;"><i class="ri-send-plane-2-line"></i></button>
            </div>
            <div>
                ${bookReviews.length === 0 ? `<p style="font-size:0.84rem; color:var(--text-muted);">لا توجد مراجعات بعد، كن أول من يناقش هذا الكتاب.</p>` :
                bookReviews.map(r => `
                    <div class="review-item-card">
                        <div style="display:flex; justify-content:space-between; font-weight:700; margin-bottom:4px;">
                            <span><i class="ri-user-3-line"></i> ${r.userName}</span>
                            <span style="color:#e69900;">${"★".repeat(r.stars)}</span>
                        </div>
                        <p>${r.comment}</p>
                    </div>
                `).join("")}
            </div>
        </div>
    `;

    document.getElementById("toggleFavModalBtn").onclick = async () => {
        if (!currentUser) return alert("يرجى تسجيل الدخول أولاً لحفظ الكتب في مكتبتك.");
        if (isFav) userFavorites = userFavorites.filter(id => id !== book.id);
        else userFavorites.push(book.id);
        await updateDoc(doc(db, "users", currentUser.uid), { favorites: userFavorites });
        openBookDetails(book);
        renderAllViews();
    };

    const dlBtn = document.getElementById("triggerConfirmDownloadBtn");
    if (dlBtn) {
        dlBtn.onclick = () => {
            document.getElementById("confirmDownloadBookTitle").textContent = `كتاب «${book.title}» - ${book.author}`;
            document.getElementById("confirmDirectDownloadLink").href = toDirectDriveDownload(book.downloadLink);
            confirmDownloadModal.style.display = "flex";
        };
    }

    document.getElementById("postReviewBtn").onclick = async () => {
        if (!currentUser) return alert("يرجى تسجيل الدخول لإضافة تقييم أو مراجعة.");
        const stars = parseInt(document.getElementById("reviewRatingSelect").value, 10);
        const comment = document.getElementById("reviewCommentField").value.trim();
        if (!comment) return;

        await addDoc(collection(db, "reviews"), {
            bookId: book.id,
            userId: currentUser.uid,
            userName: currentUser.displayName,
            stars,
            comment,
            createdAt: Date.now()
        });

        const newSum = (book.ratingSum || 0) + stars;
        const newCount = (book.ratingCount || 0) + 1;
        await updateDoc(doc(db, "books", book.id), { ratingSum: newSum, ratingCount: newCount });
        await fetchEncyclopediaData();
        const updated = allBooks.find(b => b.id === book.id);
        if (updated) openBookDetails(updated);
    };

    if (isAdmin) {
        document.getElementById("adminEditBookBtn").onclick = async () => {
            const newTitle = prompt("تعديل عنوان الكتاب:", book.title);
            if (newTitle === null) return;
            const newAuthor = prompt("تعديل اسم المؤلف:", book.author);
            if (newAuthor === null) return;
            const newDesc = prompt("تعديل الوصف:", book.description);
            if (newDesc === null) return;
            const newLink = prompt("تعديل رابط جوجل درايف:", book.downloadLink || "");
            if (newLink === null) return;

            await updateDoc(doc(db, "books", book.id), {
                title: newTitle.trim() || book.title,
                author: newAuthor.trim() || book.author,
                description: newDesc.trim() || book.description,
                downloadLink: newLink.trim(),
                status: newLink.trim() ? "published_full" : "published_no_download"
            });
            await fetchEncyclopediaData();
            const updated = allBooks.find(b => b.id === book.id);
            if (updated) openBookDetails(updated);
        };

        document.getElementById("adminSwitchDlBtn").onclick = async () => {
            if (book.status === "published_full") {
                await updateDoc(doc(db, "books", book.id), { status: "published_no_download" });
            } else {
                const link = book.downloadLink || prompt("أدخل رابط جوجل درايف لتفعيل التحميل المباشر:");
                if (!link) return;
                await updateDoc(doc(db, "books", book.id), { status: "published_full", downloadLink: link.trim() });
            }
            await fetchEncyclopediaData();
            const updated = allBooks.find(b => b.id === book.id);
            if (updated) openBookDetails(updated);
        };

        document.getElementById("adminRemoveBookBtn").onclick = async () => {
            if (confirm(`هل أنت متأكد من حذف كتاب «${book.title}» نهائياً؟`)) {
                await deleteDoc(doc(db, "books", book.id));
                bookDetailsModal.style.display = "none";
                await fetchEncyclopediaData();
            }
        };
    }

    bookDetailsModal.style.display = "flex";
}

// 9. عرض مكتبتي ولوحة المراجعة للإدارة
function renderMyLibraryView() {
    const savedGrid = document.getElementById("savedBooksShelf");
    const uploadedGrid = document.getElementById("myUploadedBooksShelf");
    savedGrid.innerHTML = "";
    uploadedGrid.innerHTML = "";

    const favs = allBooks.filter(b => userFavorites.includes(b.id));
    if (favs.length === 0) {
        savedGrid.innerHTML = `<p style="color:var(--text-muted); font-size:0.88rem;">لم تقم بحفظ أي كتاب في مفضلتك بعد.</p>`;
    } else {
        favs.forEach(b => savedGrid.appendChild(createBookCard(b)));
    }

    const mine = allBooks.filter(b => b.addedByUid === currentUser.uid);
    if (mine.length === 0) {
        uploadedGrid.innerHTML = `<p style="color:var(--text-muted); font-size:0.88rem;">لم تقم برفع أي كتاب للموسوعة حتى الآن.</p>`;
    } else {
        mine.forEach(b => uploadedGrid.appendChild(createBookCard(b, true)));
    }
}

function renderAdminReviewQueue() {
    const pending = allBooks.filter(b => b.status === "pending");
    document.getElementById("pendingBadge").textContent = pending.length;
    const container = document.getElementById("pendingBooksList");
    container.innerHTML = "";

    if (pending.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:35px; background:var(--bg-surface); border-radius:14px; border:1px solid var(--border-color);">لا توجد كتب معلقة حالياً، تم فحص واعتماد جميع الطلبات.</div>`;
        return;
    }

    pending.forEach(book => {
        const card = document.createElement("div");
        card.className = "admin-review-card";
        card.innerHTML = `
            <img src="${book.coverUrl}" style="width:75px; height:110px; object-fit:cover; border-radius:8px;">
            <div style="flex:1; min-width:210px;">
                <span class="tag-gold">${book.category}</span>
                <h4 style="margin:5px 0;">${book.title}</h4>
                <p style="font-size:0.82rem; color:var(--text-muted);">المؤلف: ${book.author} | رُفع بواسطة: ${book.addedByName || "مستخدم"}</p>
                <p style="font-size:0.82rem; margin:6px 0;">${book.description}</p>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
                    <button class="btn-primary-action approve-full-btn" style="background:var(--success); padding:7px 12px; font-size:0.8rem;">
                        <i class="ri-check-double-line"></i> نشر مع التحميل
                    </button>
                    <button class="btn-secondary-action approve-nodl-btn" style="padding:7px 12px; font-size:0.8rem;">
                        <i class="ri-book-open-line"></i> نشر موسوعي فقط (إلغاء التحميل)
                    </button>
                    <button class="btn-primary-action reject-book-btn" style="background:var(--danger); padding:7px 12px; font-size:0.8rem;">
                        <i class="ri-delete-bin-line"></i> رفض وحذف
                    </button>
                </div>
            </div>
        `;

        card.querySelector(".approve-full-btn").onclick = async () => {
            await updateDoc(doc(db, "books", book.id), { status: "published_full" });
            fetchEncyclopediaData();
        };
        card.querySelector(".approve-nodl-btn").onclick = async () => {
            await updateDoc(doc(db, "books", book.id), { status: "published_no_download", downloadLink: "" });
            fetchEncyclopediaData();
        };
        card.querySelector(".reject-book-btn").onclick = async () => {
            if (confirm(`هل أنت متأكد من رفض وحذف كتاب «${book.title}»؟`)) {
                await deleteDoc(doc(db, "books", book.id));
                fetchEncyclopediaData();
            }
        };

        container.appendChild(card);
    });
}

// 10. تثبيت التطبيق (PWA)
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
});

document.getElementById("installPwaBtn").addEventListener("click", async () => {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt = null;
    } else {
        alert("لتثبيت التطبيق على هاتفك: اضغط على قائمة المتصفح (النقاط الثلاث أعلى الشاشة) واختر «الإضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق».");
    }
});

// تشغيل الموسوعة عند التحميل
fetchEncyclopediaData();
