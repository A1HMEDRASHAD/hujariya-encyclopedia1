import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// إعدادات فايربيس (مشروع حجاريا)
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
const CONFIG_DOC_ID = "__hujariya_site_config__";

function isUserAdmin(user) {
    return Boolean(user && user.email && ADMIN_EMAILS.includes(user.email.trim().toLowerCase()));
}

// حالة التطبيق
let currentUser = null;
let isAdmin = false;
let allBooks = [];
let allReviews = [];
let userFavorites = [];
let activeCategory = "all";

// دالة تطبيع النصوص العربية لمنع تكرار الكتب بذكاء
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

// تحويل رابط جوجل درايف إلى تحميل مباشر
function getDirectDriveUrl(url) {
    if (!url) return "";
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    return match && match[1] ? `https://drive.google.com/uc?export=download&id=${match[1]}` : url;
}

// 1. إدارة المظهر الليلي والنهاري
const darkModeToggle = document.getElementById("darkModeToggle");
const quickThemeBtn = document.getElementById("quickThemeBtn");

function applyTheme(isDark) {
    document.body.classList.toggle("dark-mode", isDark);
    document.body.classList.toggle("light-mode", !isDark);
    darkModeToggle.checked = isDark;
    localStorage.setItem("hujariya_theme", isDark ? "dark" : "light");
}

applyTheme(localStorage.getItem("hujariya_theme") === "dark");

darkModeToggle.addEventListener("change", () => applyTheme(darkModeToggle.checked));
quickThemeBtn.addEventListener("click", () => applyTheme(!document.body.classList.contains("dark-mode")));

// 2. شريط التنقل السفلي (فقاعة سامسونج)
const navButtons = document.querySelectorAll(".pill-tab[data-target]");
const pages = document.querySelectorAll(".view-page");

function switchPage(targetId) {
    navButtons.forEach(btn => btn.classList.toggle("active", btn.getAttribute("data-target") === targetId));
    pages.forEach(page => page.classList.toggle("active-page", page.id === targetId));
    window.scrollTo({ top: 0, behavior: "smooth" });
}

navButtons.forEach(btn => {
    btn.addEventListener("click", () => switchPage(btn.getAttribute("data-target")));
});

// 3. المصادقة وحساب المستخدم وصلاحيات الإدارة
const authActionBtn = document.getElementById("authActionBtn");
const profileName = document.getElementById("profileName");
const profileEmail = document.getElementById("profileEmail");
const profileAvatar = document.getElementById("profileAvatar");
const adminCrownBadge = document.getElementById("adminCrownBadge");
const adminNavBtn = document.getElementById("adminNavBtn");
const adminSettingsCard = document.getElementById("adminSettingsCard");

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    isAdmin = isUserAdmin(user);

    if (user) {
        authActionBtn.innerHTML = `<i class="ri-logout-box-r-line"></i><span>تسجيل الخروج</span>`;
        authActionBtn.style.background = "var(--danger)";
        profileName.textContent = isAdmin ? `${user.displayName} (الإدارة)` : user.displayName;
        profileEmail.textContent = user.email;
        profileAvatar.src = user.photoURL || "https://ui-avatars.com/api/?name=U&background=1b302b&color=fff";

        adminCrownBadge.style.display = isAdmin ? "flex" : "none";
        adminNavBtn.style.display = isAdmin ? "flex" : "none";
        adminSettingsCard.style.display = isAdmin ? "block" : "none";

        await loadUserFavorites(user.uid);
    } else {
        authActionBtn.innerHTML = `<i class="ri-google-fill"></i><span>تسجيل الدخول بحساب جوجل</span>`;
        authActionBtn.style.background = "var(--primary)";
        profileName.textContent = "زائر الموسوعة";
        profileEmail.textContent = "سجل دخولك لحفظ الكتب والمشاركة في التوثيق والتقييم";
        profileAvatar.src = "https://ui-avatars.com/api/?name=H&background=1b302b&color=c28e48";

        adminCrownBadge.style.display = "none";
        adminNavBtn.style.display = "none";
        adminSettingsCard.style.display = "none";
        userFavorites = [];
    }
    renderAll();
});

authActionBtn.addEventListener("click", () => {
    if (currentUser) {
        signOut(auth);
    } else {
        signInWithPopup(auth, new GoogleAuthProvider()).catch(err => {
            alert("تأكد من تفعيل Google في Authentication وإضافة نطاق موقعك في Authorized domains.");
            console.error(err);
        });
    }
});

async function loadUserFavorites(uid) {
    try {
        const ref = doc(db, "users", uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            userFavorites = snap.data().favorites || [];
        } else {
            await setDoc(ref, { name: currentUser.displayName, email: currentUser.email, favorites: [] });
            userFavorites = [];
        }
    } catch (e) { console.error(e); }
}

// 4. ميزة رفع وتحديث شعار الموقع الرسمي مباشرة للإدارة
const uploadSiteLogoInput = document.getElementById("uploadSiteLogoInput");
const siteLogoImg = document.getElementById("siteLogoImg");
const siteLogoSvg = document.getElementById("siteLogoSvg");

function displayCustomLogo(url) {
    if (!url) return;
    siteLogoImg.src = url;
    siteLogoImg.onload = () => {
        siteLogoSvg.style.display = "none";
        siteLogoImg.style.display = "block";
    };
}

uploadSiteLogoInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file || !isAdmin) return;
    try {
        const fd = new FormData();
        fd.append("image", file);
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: fd });
        const data = await res.json();
        if (data.success) {
            const directLogoUrl = data.data.url;
            await setDoc(doc(db, "books", CONFIG_DOC_ID), {
                isConfigDoc: true,
                logoUrl: directLogoUrl,
                status: "config",
                updatedAt: Date.now()
            });
            displayCustomLogo(directLogoUrl);
            alert("تم تحديث شعار الموسوعة الرسمي بنجاح!");
        }
    } catch (err) {
        alert("تعذر رفع الشعار، حاول مجدداً.");
    }
});

// 5. جلب الكتب والمراجعات وإعدادات الشعار من Firestore
async function loadDatabaseData() {
    try {
        const snap = await getDocs(collection(db, "books"));
        allBooks = [];
        snap.forEach(d => {
            const data = d.data();
            if (d.id === CONFIG_DOC_ID || data.isConfigDoc) {
                if (data.logoUrl) displayCustomLogo(data.logoUrl);
            } else {
                allBooks.push({ id: d.id, ...data });
            }
        });
        allBooks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        const revSnap = await getDocs(collection(db, "reviews"));
        allReviews = revSnap.docs.map(r => ({ id: r.id, ...r.data() }));

        renderAll();
    } catch (e) {
        console.error("خطأ في جلب البيانات:", e);
    }
}

function renderAll() {
    updateNationalStats();
    renderMainBookshelf();
    renderAIShelf();
    if (currentUser) renderMyLibrary();
    if (isAdmin) renderAdminQueue();
}

// تحديث لوحة الإحصائيات الحية
function updateNationalStats() {
    const published = allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download");
    const uniqueAuthors = new Set(published.map(b => normalizeArabic(b.author)).filter(Boolean));
    document.getElementById("statTotalBooks").textContent = published.length;
    document.getElementById("statTotalAuthors").textContent = uniqueAuthors.size;
    document.getElementById("statTotalReviews").textContent = allReviews.length;
}

// 6. البحث الذكي والتصنيفات السلسة
const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const catPills = document.querySelectorAll(".cat-pill");

searchInput.addEventListener("input", () => {
    clearSearchBtn.style.display = searchInput.value ? "block" : "none";
    renderMainBookshelf();
});

clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearSearchBtn.style.display = "none";
    renderMainBookshelf();
});

catPills.forEach(pill => {
    pill.addEventListener("click", () => {
        catPills.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        activeCategory = pill.getAttribute("data-cat");
        pill.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        renderMainBookshelf();
    });
});

function renderMainBookshelf() {
    const queryText = searchInput.value.trim().toLowerCase();
    const grid = document.getElementById("mainBookshelf");
    grid.innerHTML = "";

    const published = allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download");
    const filtered = published.filter(b => {
        const matchesQuery = !queryText ||
            (b.title || "").toLowerCase().includes(queryText) ||
            (b.author || "").toLowerCase().includes(queryText) ||
            (b.description || "").toLowerCase().includes(queryText);
        const matchesCat = activeCategory === "all" || b.category === activeCategory;
        return matchesQuery && matchesCat;
    });

    document.getElementById("booksCountBadge").textContent = `${filtered.length} كتاب`;

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:45px 20px; background:var(--bg-card); border-radius:16px; border:1px dashed var(--border-subtle);">
                <i class="ri-book-2-line" style="font-size:2.6rem; color:var(--gold);"></i>
                <h4 style="margin:8px 0 4px;">لا توجد مؤلفات مطابقة في هذا الرف حالياً</h4>
                <p style="font-size:0.85rem; color:var(--text-secondary);">ساهم معنا في إثراء الموسوعة الوطنية بإضافة أول كتاب!</p>
            </div>
        `;
        return;
    }

    filtered.forEach(book => grid.appendChild(buildBookCard(book)));
}

function buildBookCard(book, showPendingState = false) {
    const card = document.createElement("div");
    card.className = "book-card";

    const avg = book.ratingCount > 0 ? (book.ratingSum / book.ratingCount).toFixed(1) : "جديد";
    const badgeLabel = showPendingState
        ? (book.status === "pending" ? "قيد المراجعة" : "منشور")
        : book.category;

    card.innerHTML = `
        <div class="cover-frame">
            <img src="${book.coverUrl}" alt="${book.title}" loading="lazy">
            <span class="card-cat-tag">${badgeLabel}</span>
        </div>
        <div class="card-body">
            <div class="card-title">${book.title}</div>
            <div class="card-author"><i class="ri-quill-pen-line"></i> ${book.author}</div>
            <div class="card-footer">
                <span class="rating-chip"><i class="ri-star-fill"></i> ${avg}</span>
                <span style="color:${book.status === 'published_full' && book.downloadLink ? 'var(--success)' : 'var(--gold)'};">
                    ${book.status === "published_full" && book.downloadLink ? '<i class="ri-download-2-line"></i> متاح' : '<i class="ri-discuss-line"></i> نقاش'}
                </span>
            </div>
        </div>
    `;
    card.addEventListener("click", () => openBookDetailsModal(book));
    return card;
}

// 7. الذكاء الاصطناعي الخفي للمقترحات الشخصية
function renderAIShelf() {
    const box = document.getElementById("aiRecommendationsBox");
    const shelf = document.getElementById("aiBookshelf");

    if (!currentUser || userFavorites.length === 0) {
        box.style.display = "none";
        return;
    }

    const favDocs = allBooks.filter(b => userFavorites.includes(b.id));
    const favCategories = new Set(favDocs.map(b => b.category));
    const favAuthors = new Set(favDocs.map(b => normalizeArabic(b.author)));

    const suggestions = allBooks.filter(b =>
        (b.status === "published_full" || b.status === "published_no_download") &&
        !userFavorites.includes(b.id) &&
        (favCategories.has(b.category) || favAuthors.has(normalizeArabic(b.author)))
    ).slice(0, 4);

    if (suggestions.length === 0) {
        box.style.display = "none";
        return;
    }

    box.style.display = "block";
    shelf.innerHTML = "";
    suggestions.forEach(b => shelf.appendChild(buildBookCard(b)));
}

// 8. فحص التكرار اللحظي ورفع الكتب
const addBookModal = document.getElementById("addBookModal");
const titleInput = document.getElementById("bookTitleInput");
const authorInput = document.getElementById("bookAuthorInput");
const liveDupWarn = document.getElementById("liveDuplicateWarning");
const coverInput = document.getElementById("bookCoverInput");
const coverFileNameText = document.getElementById("coverFileNameText");

document.getElementById("openAddModalBtn").addEventListener("click", () => {
    if (!currentUser) {
        alert("يرجى تسجيل الدخول بحساب جوجل أولاً للمساهمة بنشر الكتب.");
        switchPage("profileView");
        return;
    }
    addBookModal.style.display = "flex";
});

document.getElementById("closeAddModal").addEventListener("click", () => addBookModal.style.display = "none");

coverInput.addEventListener("change", () => {
    if (coverInput.files[0]) {
        coverFileNameText.textContent = `تم اختيار: ${coverInput.files[0].name}`;
    }
});

function checkDuplicateBook() {
    const t = normalizeArabic(titleInput.value);
    const a = normalizeArabic(authorInput.value);
    if (!t || !a) {
        liveDupWarn.style.display = "none";
        return null;
    }
    const found = allBooks.find(b => normalizeArabic(b.title) === t && normalizeArabic(b.author) === a);
    if (found) {
        liveDupWarn.style.display = "block";
        liveDupWarn.innerHTML = `<i class="ri-error-warning-line"></i> تنبيه: كتاب «${found.title}» لنفس المؤلف «${found.author}» مسجل مسبقاً في الموسوعة!`;
        return found;
    }
    liveDupWarn.style.display = "none";
    return null;
}

titleInput.addEventListener("input", checkDuplicateBook);
authorInput.addEventListener("input", checkDuplicateBook);

document.getElementById("submitBookBtn").addEventListener("click", async () => {
    const title = titleInput.value.trim();
    const author = authorInput.value.trim();
    const category = document.getElementById("bookCategoryInput").value;
    const desc = document.getElementById("bookDescInput").value.trim();
    const driveLink = document.getElementById("bookDriveInput").value.trim();
    const file = coverInput.files[0];
    const msg = document.getElementById("uploadStatusMsg");
    const btn = document.getElementById("submitBookBtn");

    if (!title || !author || !desc || !file) {
        msg.style.color = "var(--danger)";
        msg.textContent = "يرجى إكمال كافة الحقول المطلوبة واختيار صورة الغلاف.";
        return;
    }

    if (checkDuplicateBook()) {
        msg.style.color = "var(--danger)";
        msg.textContent = "لا يمكن رفع الكتاب لأنه موجود مسبقاً لنفس الكاتب.";
        return;
    }

    btn.disabled = true;
    msg.style.color = "var(--gold)";
    msg.textContent = "جاري رفع غلاف الكتاب وحفظ البيانات...";

    try {
        const fd = new FormData();
        fd.append("image", file);
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: fd });
        const imgData = await res.json();
        if (!imgData.success) throw new Error("فشل رفع الغلاف");

        const initialStatus = isAdmin ? (driveLink ? "published_full" : "published_no_download") : "pending";

        await addDoc(collection(db, "books"), {
            title,
            author,
            category,
            description: desc,
            downloadLink: driveLink,
            coverUrl: imgData.data.url,
            status: initialStatus,
            addedByUid: currentUser.uid,
            addedByName: currentUser.displayName,
            addedByEmail: currentUser.email,
            ratingSum: 0,
            ratingCount: 0,
            createdAt: Date.now()
        });

        msg.style.color = "var(--success)";
        msg.textContent = isAdmin ? "تم النشر الفوري على رفوف الموسوعة بنجاح!" : "تم الرفع بنجاح! سيظهر الكتاب بعد مراجعة الإدارة.";

        titleInput.value = "";
        authorInput.value = "";
        document.getElementById("bookDescInput").value = "";
        document.getElementById("bookDriveInput").value = "";
        coverInput.value = "";
        coverFileNameText.textContent = "اضغط لاختيار صورة غلاف واضحة";

        await loadDatabaseData();
        setTimeout(() => {
            addBookModal.style.display = "none";
            msg.textContent = "";
            btn.disabled = false;
        }, 1400);
    } catch (e) {
        msg.style.color = "var(--danger)";
        msg.textContent = "حدث خطأ أثناء الرفع، يرجى المحاولة مرة أخرى.";
        btn.disabled = false;
    }
});

// 9. تفاصيل الكتاب + تأكيد التحميل + المراجعات + صلاحيات الإدارة
const bookDetailsModal = document.getElementById("bookDetailsModal");
const confirmDownloadModal = document.getElementById("confirmDownloadModal");

document.getElementById("closeDetailsModal").onclick = () => bookDetailsModal.style.display = "none";
document.getElementById("closeConfirmDownload").onclick = () => confirmDownloadModal.style.display = "none";
document.getElementById("cancelDownloadBtn").onclick = () => confirmDownloadModal.style.display = "none";
document.getElementById("directDownloadBtn").onclick = () => setTimeout(() => confirmDownloadModal.style.display = "none", 400);

function openBookDetailsModal(book) {
    const isFav = userFavorites.includes(book.id);
    const avg = book.ratingCount > 0 ? (book.ratingSum / book.ratingCount).toFixed(1) : "لم يقيّم بعد";
    const bookReviews = allReviews.filter(r => r.bookId === book.id).sort((a, b) => b.createdAt - a.createdAt);

    const container = document.getElementById("bookDetailsBody");
    container.innerHTML = `
        <div class="detail-top">
            <img src="${book.coverUrl}" class="detail-cover" alt="${book.title}">
            <div class="detail-meta">
                <span class="count-pill">${book.category}</span>
                <h2>${book.title}</h2>
                <p style="color:var(--text-secondary); font-weight:700;"><i class="ri-user-pen-line"></i> المؤلف: ${book.author}</p>
                <p style="color:#e69900; font-weight:700; margin-top:6px;"><i class="ri-star-fill"></i> التقييم: ${avg} (${book.ratingCount || 0} مراجعة)</p>
            </div>
        </div>

        <div class="detail-desc">${book.description}</div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button id="modalFavBtn" class="btn-ghost" style="flex:1;">
                <i class="${isFav ? 'ri-bookmark-fill' : 'ri-bookmark-line'}"></i>
                <span>${isFav ? 'محفوظ في مكتبتي' : 'حفظ في مكتبتي'}</span>
            </button>

            ${book.status === "published_full" && book.downloadLink ? `
                <button id="modalDownloadTrigger" class="btn-main" style="flex:1; background:var(--gold);">
                    <i class="ri-download-cloud-2-line"></i>
                    <span>تحميل الكتاب (PDF)</span>
                </button>
            ` : `
                <div style="flex:1; padding:10px; border-radius:10px; background:var(--bg-elevated); font-size:0.8rem; text-align:center; font-weight:700; color:var(--text-secondary);">
                    <i class="ri-shield-keyhole-line"></i> متاح للتوثيق والمراجعة والنقاش فقط (حقوق محفوظة)
                </div>
            `}
        </div>

        ${isAdmin ? `
            <div style="margin-top:16px; padding:12px; border:1px dashed var(--gold); border-radius:12px; background:var(--gold-light);">
                <strong style="display:block; margin-bottom:8px; font-size:0.86rem;"><i class="ri-vip-crown-line"></i> تحكم الإدارة الفوري بالكتاب:</strong>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button id="adminEditBookBtn" class="btn-main" style="padding:7px 12px; font-size:0.8rem;"><i class="ri-edit-box-line"></i> تعديل البيانات</button>
                    <button id="adminToggleDlBtn" class="btn-gold-sm"><i class="ri-refresh-line"></i> ${book.status === 'published_full' ? 'إلغاء التحميل (موسوعي فقط)' : 'تفعيل زر التحميل'}</button>
                    <button id="adminDeleteBookBtn" class="btn-main" style="background:var(--danger); padding:7px 12px; font-size:0.8rem;"><i class="ri-delete-bin-line"></i> حذف</button>
                </div>
            </div>
        ` : ""}

        <div class="reviews-box">
            <h4 style="margin-bottom:10px;"><i class="ri-chat-quote-line"></i> المراجعات والنقاشات الثقافية (${bookReviews.length})</h4>
            <div style="display:flex; gap:8px; margin-bottom:8px;">
                <select id="newReviewStars" style="padding:8px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-main); color:var(--text-primary); font-weight:700;">
                    <option value="5">5 نجوم - ممتاز</option>
                    <option value="4">4 نجوم - جيد جداً</option>
                    <option value="3">3 نجوم - متوسط</option>
                    <option value="2">نجمتان - مقبول</option>
                    <option value="1">نجمة واحدة</option>
                </select>
                <input type="text" id="newReviewText" placeholder="اكتب رأيك أو مراجعتك حول الكتاب..." style="flex:1; padding:8px 12px; border-radius:8px; border:1px solid var(--border-subtle); background:var(--bg-main); color:var(--text-primary);">
                <button id="sendReviewBtn" class="btn-main" style="padding:8px 14px;"><i class="ri-send-plane-2-line"></i></button>
            </div>
            <div id="modalReviewsList">
                ${bookReviews.length === 0 ? `<p style="font-size:0.84rem; color:var(--text-secondary);">كن أول من يفتتح النقاش حول هذا المؤلف.</p>` :
                bookReviews.map(r => `
                    <div class="review-card">
                        <div style="display:flex; justify-content:space-between; font-weight:700; margin-bottom:4px;">
                            <span><i class="ri-user-smile-line"></i> ${r.userName}</span>
                            <span style="color:#e69900;">${"★".repeat(r.stars)}</span>
                        </div>
                        <p>${r.comment}</p>
                    </div>
                `).join("")}
            </div>
        </div>
    `;

    // حفظ في المفضلة
    document.getElementById("modalFavBtn").onclick = async () => {
        if (!currentUser) return alert("يرجى تسجيل الدخول أولاً.");
        if (isFav) userFavorites = userFavorites.filter(id => id !== book.id);
        else userFavorites.push(book.id);
        await updateDoc(doc(db, "users", currentUser.uid), { favorites: userFavorites });
        openBookDetailsModal(book);
        renderAll();
    };

    // فتح نافذة التأكيد قبل التحميل المباشر
    const dlTrigger = document.getElementById("modalDownloadTrigger");
    if (dlTrigger) {
        dlTrigger.onclick = () => {
            document.getElementById("confirmDownloadTitle").textContent = `تحميل كتاب «${book.title}»`;
            document.getElementById("directDownloadBtn").href = getDirectDriveUrl(book.downloadLink);
            confirmDownloadModal.style.display = "flex";
        };
    }

    // إرسال مراجعة جديدة
    document.getElementById("sendReviewBtn").onclick = async () => {
        if (!currentUser) return alert("يرجى تسجيل الدخول لإضافة مراجعة.");
        const stars = parseInt(document.getElementById("newReviewStars").value, 10);
        const comment = document.getElementById("newReviewText").value.trim();
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
        await loadDatabaseData();
        const updated = allBooks.find(b => b.id === book.id);
        if (updated) openBookDetailsModal(updated);
    };

    // أزرار الإدارة داخل الكتاب
    if (isAdmin) {
        document.getElementById("adminEditBookBtn").onclick = async () => {
            const newTitle = prompt("تعديل عنوان الكتاب:", book.title);
            if (newTitle === null) return;
            const newAuthor = prompt("تعديل اسم المؤلف:", book.author);
            if (newAuthor === null) return;
            const newDesc = prompt("تعديل الوصف:", book.description);
            if (newDesc === null) return;
            const newLink = prompt("رابط جوجل درايف:", book.downloadLink || "");
            if (newLink === null) return;

            await updateDoc(doc(db, "books", book.id), {
                title: newTitle.trim() || book.title,
                author: newAuthor.trim() || book.author,
                description: newDesc.trim() || book.description,
                downloadLink: newLink.trim(),
                status: newLink.trim() ? "published_full" : "published_no_download"
            });
            await loadDatabaseData();
            const updated = allBooks.find(b => b.id === book.id);
            if (updated) openBookDetailsModal(updated);
        };

        document.getElementById("adminToggleDlBtn").onclick = async () => {
            if (book.status === "published_full") {
                await updateDoc(doc(db, "books", book.id), { status: "published_no_download" });
            } else {
                const link = book.downloadLink || prompt("أدخل رابط جوجل درايف لتفعيل التحميل:");
                if (!link) return;
                await updateDoc(doc(db, "books", book.id), { status: "published_full", downloadLink: link.trim() });
            }
            await loadDatabaseData();
            const updated = allBooks.find(b => b.id === book.id);
            if (updated) openBookDetailsModal(updated);
        };

        document.getElementById("adminDeleteBookBtn").onclick = async () => {
            if (confirm(`حذف كتاب «${book.title}» نهائياً؟`)) {
                await deleteDoc(doc(db, "books", book.id));
                bookDetailsModal.style.display = "none";
                await loadDatabaseData();
            }
        };
    }

    bookDetailsModal.style.display = "flex";
}

// 10. عرض مكتبتي ولوحة المراجعة
function renderMyLibrary() {
    const savedGrid = document.getElementById("savedBooksShelf");
    const uploadedGrid = document.getElementById("myUploadedBooksShelf");
    savedGrid.innerHTML = "";
    uploadedGrid.innerHTML = "";

    const favs = allBooks.filter(b => userFavorites.includes(b.id));
    if (favs.length === 0) {
        savedGrid.innerHTML = `<p style="color:var(--text-secondary); font-size:0.88rem;">لا توجد كتب محفوظة في مفضلتك بعد.</p>`;
    } else {
        favs.forEach(b => savedGrid.appendChild(buildBookCard(b)));
    }

    const mine = allBooks.filter(b => b.addedByUid === currentUser.uid);
    if (mine.length === 0) {
        uploadedGrid.innerHTML = `<p style="color:var(--text-secondary); font-size:0.88rem;">لم تقم برفع أي كتاب حتى الآن.</p>`;
    } else {
        mine.forEach(b => uploadedGrid.appendChild(buildBookCard(b, true)));
    }
}

function renderAdminQueue() {
    const pending = allBooks.filter(b => b.status === "pending");
    document.getElementById("pendingBadge").textContent = pending.length;
    const container = document.getElementById("pendingBooksList");
    container.innerHTML = "";

    if (pending.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:35px; background:var(--bg-card); border-radius:14px;">لا توجد كتب معلقة حالياً، تم فحص جميع الطلبات.</div>`;
        return;
    }

    pending.forEach(book => {
        const div = document.createElement("div");
        div.className = "admin-item-card";
        div.innerHTML = `
            <img src="${book.coverUrl}" style="width:75px; height:110px; object-fit:cover; border-radius:8px;">
            <div style="flex:1; min-width:210px;">
                <span class="count-pill">${book.category}</span>
                <h4 style="margin:5px 0;">${book.title}</h4>
                <p style="font-size:0.82rem; color:var(--text-secondary);">المؤلف: ${book.author} | رُفع بواسطة: ${book.addedByName || "مستخدم"}</p>
                <p style="font-size:0.82rem; margin:6px 0;">${book.description}</p>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
                    <button class="btn-main approve-dl" style="background:var(--success); padding:7px 12px; font-size:0.8rem;"><i class="ri-check-double-line"></i> نشر مع التحميل</button>
                    <button class="btn-gold-sm approve-nodl"><i class="ri-book-read-line"></i> نشر موسوعي فقط (بدون تحميل)</button>
                    <button class="btn-main reject-btn" style="background:var(--danger); padding:7px 12px; font-size:0.8rem;"><i class="ri-close-circle-line"></i> رفض وحذف</button>
                </div>
            </div>
        `;

        div.querySelector(".approve-dl").onclick = async () => {
            await updateDoc(doc(db, "books", book.id), { status: "published_full" });
            loadDatabaseData();
        };
        div.querySelector(".approve-nodl").onclick = async () => {
            await updateDoc(doc(db, "books", book.id), { status: "published_no_download", downloadLink: "" });
            loadDatabaseData();
        };
        div.querySelector(".reject-btn").onclick = async () => {
            if (confirm(`رفض وحذف كتاب «${book.title}»؟`)) {
                await deleteDoc(doc(db, "books", book.id));
                loadDatabaseData();
            }
        };

        container.appendChild(div);
    });
}

// 11. دعم تثبيت التطبيق على الجوال (PWA)
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

document.getElementById("installAppRow").addEventListener("click", async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt = null;
    } else {
        alert("لتثبيت التطبيق على جوالك: اضغط على قائمة المتصفح (النقاط الثلاث أعلى الشاشة) ثم اختر «الإضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق».");
    }
});

// بدء تشغيل الموسوعة
loadDatabaseData();
