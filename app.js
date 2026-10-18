import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 1. إعدادات فايربيس الخاصة بمشروعك (حجاريا)
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

// مفتاح رفع الأغلفة ImgBB
const IMGBB_API_KEY = "E9d57b2ba79217bb8bde762b332b7c62".trim().toLowerCase();

// البريد الإلكتروني المعتمد للإدارة المطلقة
const ADMIN_EMAILS = [
    "rawialshamal@gmail.com",
    "a1hmedrashad@gmail.com"
];

function isUserAdmin(user) {
    return user && user.email && ADMIN_EMAILS.includes(user.email.trim().toLowerCase());
}

// متغيرات الحالة العامة
let currentUser = null;
let isAdmin = false;
let allBooks = [];
let userFavorites = [];
let currentSelectedBook = null;

// عناصر الواجهة
const authBtn = document.getElementById("authBtn");
const openAddModalBtn = document.getElementById("openAddModalBtn");
const myLibraryTabBtn = document.getElementById("myLibraryTabBtn");
const adminTabBtn = document.getElementById("adminTabBtn");
const pendingBadge = document.getElementById("pendingBadge");
const userProfileArea = document.getElementById("userProfileArea");
const userAvatar = document.getElementById("userAvatar");
const userName = document.getElementById("userName");
const toggleAdminModeBtn = document.getElementById("toggleAdminModeBtn");

// إخفاء زر الفوتر القديم نهائياً لأن الإدارة أصبحت مربوطة بالبريد رسمياً
if (toggleAdminModeBtn) {
    toggleAdminModeBtn.style.display = "none";
}

// دالة تطبيع النصوص العربية لمنع تكرار الكتب بذكاء فائق
function normalizeArabic(text) {
    if (!text) return "";
    return text
        .trim()
        .toLowerCase()
        .replace(/[\u064B-\u065F]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/^(ال|روايه|رواية|كتاب)\s+/g, "")
        .replace(/\s+/g, " ");
}

// دالة تحويل رابط جوجل درايف إلى رابط تحميل مباشر
function getDirectDriveDownloadUrl(url) {
    if (!url) return "";
    const matchId = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (matchId && matchId[1]) {
        return `https://drive.google.com/uc?export=download&id=${matchId[1]}`;
    }
    return url;
}

// 2. إدارة تسجيل الدخول والتحقق من صلاحية الإدارة
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    isAdmin = isUserAdmin(user);

    if (user) {
        authBtn.textContent = "خروج";
        openAddModalBtn.style.display = "inline-block";
        myLibraryTabBtn.style.display = "inline-block";
        userProfileArea.style.display = "flex";
        userAvatar.src = user.photoURL || "https://via.placeholder.com/40";
        userName.textContent = isAdmin ? `👑 ${user.displayName} (إدارة)` : user.displayName;

        // إظهار لوحة المراجعة تلقائياً إذا كان البريد من ضمن الإدارة
        adminTabBtn.style.display = isAdmin ? "inline-block" : "none";

        await loadUserProfileData(user.uid);
    } else {
        authBtn.textContent = "تسجيل الدخول بجوجل";
        openAddModalBtn.style.display = "none";
        myLibraryTabBtn.style.display = "none";
        adminTabBtn.style.display = "none";
        userProfileArea.style.display = "none";
        userFavorites = [];

        // الرجوع للرفوف الرئيسية عند تسجيل الخروج
        document.querySelector('[data-tab="shelvesTab"]').click();
    }
    renderAllViews();
});

authBtn.addEventListener("click", () => {
    if (currentUser) {
        signOut(auth);
    } else {
        const provider = new GoogleAuthProvider();
        signInWithPopup(auth, provider).catch(err => {
            alert("تنبيه: لتشغيل تسجيل الدخول، تأكد من تفعيل Google داخل قسم Authentication في فايربيس، وإضافة رابط موقعك في قائمة Authorized domains.");
            console.error(err);
        });
    }
});

// حفظ وجلب ملف المستخدم ومفضلاته
async function loadUserProfileData(uid) {
    try {
        const userRef = doc(db, "users", uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
            userFavorites = snap.data().favorites || [];
        } else {
            await setDoc(userRef, {
                name: currentUser.displayName,
                email: currentUser.email,
                role: isAdmin ? "admin" : "member",
                favorites: []
            });
            userFavorites = [];
        }
    } catch (e) {
        console.error("خطأ في جلب ملف المستخدم:", e);
    }
}

// 3. التنقل بين التبويبات
document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-tab");
        if (targetId === "adminTab" && !isAdmin) return;

        document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(t => t.style.display = "none");
        btn.classList.add("active");
        document.getElementById(targetId).style.display = "block";
    });
});

// 4. جلب كافة الكتب من قاعدة البيانات
async function fetchBooksFromFirestore() {
    try {
        const snap = await getDocs(collection(db, "books"));
        allBooks = [];
        snap.forEach(docSnap => {
            allBooks.push({ id: docSnap.id, ...docSnap.data() });
        });
        allBooks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        renderAllViews();
    } catch (error) {
        console.error("خطأ في جلب الكتب:", error);
        document.getElementById("booksCountText").textContent = "يرجى إكمال خطوة لصق قواعد الأمان (Rules) في Firestore Database.";
    }
}

function renderAllViews() {
    renderMainShelves();
    renderAIRecommendations();
    if (currentUser) {
        renderMyLibrary();
    }
    if (isAdmin) {
        renderAdminPendingList();
    }
}

// 5. عرض الرفوف الحية والفلترة
function renderMainShelves() {
    const searchVal = document.getElementById("searchInput").value.trim().toLowerCase();
    const categoryVal = document.getElementById("categoryFilter").value;
    const shelfContainer = document.getElementById("mainBookshelf");
    shelfContainer.innerHTML = "";

    const publishedBooks = allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download");

    const filtered = publishedBooks.filter(b => {
        const matchSearch = (b.title || "").toLowerCase().includes(searchVal) || (b.author || "").toLowerCase().includes(searchVal);
        const matchCat = categoryVal === "all" || b.category === categoryVal;
        return matchSearch && matchCat;
    });

    document.getElementById("booksCountText").textContent = `إجمالي المؤلفات الموثقة: ${filtered.length} كتاب`;

    if (filtered.length === 0) {
        shelfContainer.innerHTML = `<p style="grid-column: 1/-1; text-align:center; padding: 40px; color:#666;">لا توجد كتب مطابقة حالياً على هذا الرف. كن أول من يساهم بإضافة كتاب!</p>`;
        return;
    }

    filtered.forEach(book => {
        shelfContainer.appendChild(createBookCardElement(book));
    });
}

document.getElementById("searchInput").addEventListener("input", renderMainShelves);
document.getElementById("categoryFilter").addEventListener("change", renderMainShelves);

// إنشاء بطاقة كتاب بتصميم الرفوف
function createBookCardElement(book, showStatusBadge = false) {
    const card = document.createElement("div");
    card.className = "book-card";

    const avgRating = book.ratingCount > 0 ? (book.ratingSum / book.ratingCount).toFixed(1) : "جديد";
    const statusText = book.status === "pending" ? "⏳ قيد المراجعة" : 
                       (book.status === "published_no_download" ? "📖 موسوعي للمناقشة" : "📥 متاح للتحميل");

    card.innerHTML = `
        <div class="book-cover-wrapper">
            <img src="${book.coverUrl}" alt="${book.title}" loading="lazy">
            <span class="book-status-ribbon">${showStatusBadge ? statusText : book.category}</span>
        </div>
        <h4>${book.title}</h4>
        <div class="author-name">✍️ ${book.author}</div>
        <div class="book-card-footer">
            <span class="stars-display">⭐ ${avgRating} (${book.ratingCount || 0})</span>
            <span>${book.status === "published_full" && book.downloadLink ? "📥 تحميل" : "💬 مراجعة"}</span>
        </div>
    `;

    card.addEventListener("click", () => openBookDetailsModal(book));
    return card;
}

// 6. محرك الذكاء الاصطناعي الخفي للمقترحات الشخصية
function renderAIRecommendations() {
    const aiSection = document.getElementById("aiRecommendationsSection");
    const aiShelf = document.getElementById("aiShelf");

    if (!currentUser || userFavorites.length === 0) {
        aiSection.style.display = "none";
        return;
    }

    const favBooks = allBooks.filter(b => userFavorites.includes(b.id));
    const preferredCategories = {};
    favBooks.forEach(b => {
        preferredCategories[b.category] = (preferredCategories[b.category] || 0) + 1;
    });

    const recommended = allBooks.filter(b => 
        (b.status === "published_full" || b.status === "published_no_download") &&
        !userFavorites.includes(b.id) &&
        preferredCategories[b.category]
    ).slice(0, 4);

    if (recommended.length === 0) {
        aiSection.style.display = "none";
        return;
    }

    aiSection.style.display = "block";
    aiShelf.innerHTML = "";
    recommended.forEach(book => aiShelf.appendChild(createBookCardElement(book)));
}

// 7. رفع كتاب جديد مع فحص التكرار الذكي
const addBookModal = document.getElementById("addBookModal");
document.getElementById("openAddModalBtn").addEventListener("click", () => addBookModal.style.display = "flex");
document.getElementById("closeAddModal").addEventListener("click", () => addBookModal.style.display = "none");

document.getElementById("submitBookBtn").addEventListener("click", async () => {
    if (!currentUser) return alert("يرجى تسجيل الدخول أولاً.");

    const title = document.getElementById("bookTitleInput").value.trim();
    const author = document.getElementById("bookAuthorInput").value.trim();
    const category = document.getElementById("bookCategoryInput").value;
    const desc = document.getElementById("bookDescInput").value.trim();
    const driveLink = document.getElementById("bookDriveInput").value.trim();
    const coverFile = document.getElementById("bookCoverInput").files[0];
    const statusMsg = document.getElementById("uploadStatusMsg");
    const submitBtn = document.getElementById("submitBookBtn");

    if (!title || !author || !desc || !coverFile) {
        statusMsg.style.color = "#c92a2a";
        statusMsg.textContent = "⚠️ يرجى تعبئة جميع الحقول الأساسية وإرفاق صورة الغلاف.";
        return;
    }

    submitBtn.disabled = true;
    statusMsg.style.color = "#1b302b";
    statusMsg.textContent = "🔍 جاري فحص قاعدة البيانات للتحقق من عدم تكرار الكتاب...";

    const normTitle = normalizeArabic(title);
    const normAuthor = normalizeArabic(author);

    const duplicateBook = allBooks.find(b => 
        normalizeArabic(b.title) === normTitle && normalizeArabic(b.author) === normAuthor
    );

    if (duplicateBook) {
        statusMsg.style.color = "#c92a2a";
        statusMsg.textContent = `❌ مرفوض: كتاب «${title}» للمؤلف «${author}» موجود مسبقاً في الموسوعة!`;
        submitBtn.disabled = false;
        return;
    }

    try {
        statusMsg.textContent = "🖼️ جاري رفع غلاف الكتاب بأعلى جودة...";
        const formData = new FormData();
        formData.append("image", coverFile);

        const imgRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: "POST",
            body: formData
        });
        const imgData = await imgRes.json();

        if (!imgData.success) {
            throw new Error("فشل رفع الغلاف، تأكد من صلاحية مفتاح ImgBB.");
        }

        // إذا كان الرافع هو المدير نفسه، يُنشر الكتاب فوراً، وإلا يحال للمراجعة
        const initialStatus = isAdmin ? (driveLink ? "published_full" : "published_no_download") : "pending";

        statusMsg.textContent = isAdmin ? "☁️ جاري النشر الفوري بصلاحية الإدارة..." : "☁️ جاري حفظ الكتاب وإحالته لقسم المراجعة...";

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

        statusMsg.style.color = "#2b8a3e";
        statusMsg.textContent = isAdmin ? "✅ تم نشر الكتاب مباشرة على الرفوف!" : "✅ تم رفع الكتاب بنجاح! سيظهر على الرفوف فور اعتماده من الإدارة.";

        document.getElementById("bookTitleInput").value = "";
        document.getElementById("bookAuthorInput").value = "";
        document.getElementById("bookDescInput").value = "";
        document.getElementById("bookDriveInput").value = "";
        document.getElementById("bookCoverInput").value = "";

        await fetchBooksFromFirestore();

        setTimeout(() => {
            addBookModal.style.display = "none";
            statusMsg.textContent = "";
            submitBtn.disabled = false;
        }, 1600);

    } catch (err) {
        console.error(err);
        statusMsg.style.color = "#c92a2a";
        statusMsg.textContent = "❌ حدث خطأ أثناء الرفع: " + err.message;
        submitBtn.disabled = false;
    }
});

// 8. نافذة تفاصيل الكتاب + أدوات الإدارة المطلقة للتعديل والحذف
const bookDetailsModal = document.getElementById("bookDetailsModal");
document.getElementById("closeDetailsModal").addEventListener("click", () => bookDetailsModal.style.display = "none");

async function openBookDetailsModal(book) {
    currentSelectedBook = book;
    document.getElementById("detailCover").src = book.coverUrl;
    document.getElementById("detailCategory").textContent = book.category;
    document.getElementById("detailTitle").textContent = book.title;
    document.getElementById("detailAuthor").textContent = `المؤلف: ${book.author}`;
    document.getElementById("detailDescription").textContent = book.description;

    const avg = book.ratingCount > 0 ? (book.ratingSum / book.ratingCount).toFixed(1) : "لا توجد تقييمات بعد";
    document.getElementById("detailRatingSummary").innerHTML = `<strong>⭐ التقييم العام:</strong> ${avg} (${book.ratingCount || 0} تقييم)`;

    const favBtn = document.getElementById("toggleFavoriteBtn");
    const isFav = userFavorites.includes(book.id);
    favBtn.textContent = isFav ? "✅ محفوظ في مكتبتي (إزالة)" : "🔖 حفظ في مكتبتي";

    const downloadArea = document.getElementById("downloadActionArea");
    downloadArea.innerHTML = "";

    if (book.status === "published_full" && book.downloadLink) {
        const dlBtn = document.createElement("button");
        dlBtn.className = "btn-gold full-width";
        dlBtn.textContent = "📥 تحميل الكتاب (PDF)";
        dlBtn.onclick = () => openConfirmDownloadModal(book);
        downloadArea.appendChild(dlBtn);
    } else {
        downloadArea.innerHTML = `
            <div class="no-download-box">
                🔒 هذا الكتاب مُدرج في الموسوعة الوطنية للتوثيق والمراجعة والمناقشة فقط (حفاظاً على حقوق المؤلف والناشر).
            </div>
        `;
    }

    // إظهار لوحة التحكم والتعديل المباشر داخل الكتاب للإدارة فقط
    if (isAdmin) {
        const adminControlBox = document.createElement("div");
        adminControlBox.style.cssText = "margin-top:15px; padding:12px; background:#fff9db; border:1px solid #f08c00; border-radius:8px; text-align:right; font-size:0.85rem;";
        adminControlBox.innerHTML = `
            <strong style="display:block; margin-bottom:8px; color:#b45309;">👑 صلاحيات الإدارة المطلقة:</strong>
            <button id="adminEditBookBtn" style="width:100%; margin-bottom:6px; padding:7px; background:#1b302b; color:white; border:none; border-radius:5px; cursor:pointer; font-family:inherit; font-weight:700;">✏️ تعديل بيانات الكتاب أو الرابط</button>
            <button id="adminToggleDlBtn" style="width:100%; margin-bottom:6px; padding:7px; background:#e67700; color:white; border:none; border-radius:5px; cursor:pointer; font-family:inherit; font-weight:700;">
                ${book.status === "published_full" ? "🔒 إيقاف التحميل (تحويل لموسوعي فقط)" : "🔓 تفعيل زر التحميل المباشر"}
            </button>
            <button id="adminDeleteBookBtn" style="width:100%; padding:7px; background:#c92a2a; color:white; border:none; border-radius:5px; cursor:pointer; font-family:inherit; font-weight:700;">🗑️ حذف الكتاب نهائياً</button>
        `;
        downloadArea.appendChild(adminControlBox);

        // تعديل بيانات الكتاب بالكامل
        adminControlBox.querySelector("#adminEditBookBtn").onclick = async () => {
            const newTitle = prompt("تعديل عنوان الكتاب:", book.title);
            if (newTitle === null) return;
            const newAuthor = prompt("تعديل اسم المؤلف:", book.author);
            if (newAuthor === null) return;
            const newCategory = prompt("تعديل التصنيف:", book.category);
            if (newCategory === null) return;
            const newDesc = prompt("تعديل نبذة الكتاب:", book.description);
            if (newDesc === null) return;
            const newLink = prompt("تعديل رابط جوجل درايف (اتركه فارغاً لإلغاء الرابط):", book.downloadLink || "");
            if (newLink === null) return;

            await updateDoc(doc(db, "books", book.id), {
                title: newTitle.trim() || book.title,
                author: newAuthor.trim() || book.author,
                category: newCategory.trim() || book.category,
                description: newDesc.trim() || book.description,
                downloadLink: newLink.trim(),
                status: newLink.trim() ? "published_full" : "published_no_download"
            });

            await fetchBooksFromFirestore();
            const updated = allBooks.find(b => b.id === book.id);
            if (updated) openBookDetailsModal(updated);
        };

        // تبديل حالة التحميل بنقرة واحدة
        adminControlBox.querySelector("#adminToggleDlBtn").onclick = async () => {
            if (book.status === "published_full") {
                await updateDoc(doc(db, "books", book.id), { status: "published_no_download" });
            } else {
                const linkToUse = book.downloadLink || prompt("أدخل رابط جوجل درايف لتفعيل التحميل:");
                if (!linkToUse) return;
                await updateDoc(doc(db, "books", book.id), {
                    status: "published_full",
                    downloadLink: linkToUse.trim()
                });
            }
            await fetchBooksFromFirestore();
            const updated = allBooks.find(b => b.id === book.id);
            if (updated) openBookDetailsModal(updated);
        };

        // حذف الكتاب نهائياً
        adminControlBox.querySelector("#adminDeleteBookBtn").onclick = async () => {
            if (confirm(`هل أنت متأكد من الحذف النهائي لكتاب «${book.title}»؟`)) {
                await deleteDoc(doc(db, "books", book.id));
                bookDetailsModal.style.display = "none";
                await fetchBooksFromFirestore();
            }
        };
    }

    bookDetailsModal.style.display = "flex";
    loadBookReviews(book.id);
}

// نافذة تأكيد التحميل المباشر من جوجل درايف
const confirmDownloadModal = document.getElementById("confirmDownloadModal");
function openConfirmDownloadModal(book) {
    document.getElementById("confirmDownloadText").textContent = `هل أنت متأكد من تحميل كتاب «${book.title}» للمؤلف ${book.author}؟`;
    document.getElementById("directDownloadLink").href = getDirectDriveDownloadUrl(book.downloadLink);
    confirmDownloadModal.style.display = "flex";
}

document.getElementById("closeConfirmDownload").addEventListener("click", () => confirmDownloadModal.style.display = "none");
document.getElementById("cancelDownloadBtn").addEventListener("click", () => confirmDownloadModal.style.display = "none");
document.getElementById("directDownloadLink").addEventListener("click", () => {
    setTimeout(() => confirmDownloadModal.style.display = "none", 500);
});

// حفظ/إزالة الكتاب من "مكتبتي"
document.getElementById("toggleFavoriteBtn").addEventListener("click", async () => {
    if (!currentUser || !currentSelectedBook) {
        alert("يرجى تسجيل الدخول بحسابك لحفظ الكتب في مكتبتك الخاصة.");
        return;
    }
    const bookId = currentSelectedBook.id;
    if (userFavorites.includes(bookId)) {
        userFavorites = userFavorites.filter(id => id !== bookId);
    } else {
        userFavorites.push(bookId);
    }

    await updateDoc(doc(db, "users", currentUser.uid), { favorites: userFavorites });
    openBookDetailsModal(currentSelectedBook);
    renderAllViews();
});

// نشر تقييم ومراجعة للكتاب
document.getElementById("submitReviewBtn").addEventListener("click", async () => {
    if (!currentUser) return alert("يرجى تسجيل الدخول لإضافة تقييم أو مناقشة.");
    if (!currentSelectedBook) return;

    const stars = parseInt(document.getElementById("reviewStarsInput").value, 10);
    const comment = document.getElementById("reviewCommentInput").value.trim();

    if (!comment) return alert("يرجى كتابة مراجعتك أو رأيك حول الكتاب.");

    try {
        await addDoc(collection(db, "reviews"), {
            bookId: currentSelectedBook.id,
            userId: currentUser.uid,
            userName: currentUser.displayName,
            stars,
            comment,
            createdAt: Date.now()
        });

        const newSum = (currentSelectedBook.ratingSum || 0) + stars;
        const newCount = (currentSelectedBook.ratingCount || 0) + 1;
        await updateDoc(doc(db, "books", currentSelectedBook.id), {
            ratingSum: newSum,
            ratingCount: newCount
        });

        currentSelectedBook.ratingSum = newSum;
        currentSelectedBook.ratingCount = newCount;
        document.getElementById("reviewCommentInput").value = "";

        await fetchBooksFromFirestore();
        openBookDetailsModal(currentSelectedBook);
    } catch (e) {
        console.error("خطأ في نشر التقييم:", e);
    }
});

async function loadBookReviews(bookId) {
    const container = document.getElementById("reviewsListContainer");
    container.innerHTML = "جاري تحميل المراجعات...";
    try {
        const snap = await getDocs(collection(db, "reviews"));
        const bookReviews = [];
        snap.forEach(d => {
            if (d.data().bookId === bookId) bookReviews.push({ id: d.id, ...d.data() });
        });
        bookReviews.sort((a, b) => b.createdAt - a.createdAt);

        if (bookReviews.length === 0) {
            container.innerHTML = `<p style="color:#777; font-size:0.9rem;">لا توجد مراجعات بعد. افتح باب النقاش وكن أول من يقيّم هذا الكتاب!</p>`;
            return;
        }

        container.innerHTML = "";
        bookReviews.forEach(r => {
            const div = document.createElement("div");
            div.className = "review-item";
            div.innerHTML = `
                <div class="review-item-header">
                    <span>👤 ${r.userName}</span>
                    <div>
                        <span>${"⭐".repeat(r.stars)}</span>
                        ${isAdmin ? `<button data-rid="${r.id}" class="del-review-btn" style="background:none; border:none; color:#c92a2a; cursor:pointer; margin-right:8px; font-weight:bold;">🗑️ حذف</button>` : ""}
                    </div>
                </div>
                <p style="font-size:0.92rem; margin-top:4px;">${r.comment}</p>
            `;

            if (isAdmin) {
                div.querySelector(".del-review-btn").onclick = async () => {
                    if (confirm("حذف هذه المراجعة؟")) {
                        await deleteDoc(doc(db, "reviews", r.id));
                        loadBookReviews(bookId);
                    }
                };
            }

            container.appendChild(div);
        });
    } catch (e) {
        container.innerHTML = "تعذر تحميل المراجعات.";
    }
}

// 9. عرض تبويب "مكتبتي"
function renderMyLibrary() {
    const savedShelf = document.getElementById("savedBooksShelf");
    const myUploadedShelf = document.getElementById("myUploadedBooksShelf");
    savedShelf.innerHTML = "";
    myUploadedShelf.innerHTML = "";

    const favBooks = allBooks.filter(b => userFavorites.includes(b.id));
    if (favBooks.length === 0) {
        savedShelf.innerHTML = `<p style="color:#666;">لم تقم بحفظ أي كتاب في مفضلتك بعد.</p>`;
    } else {
        favBooks.forEach(b => savedShelf.appendChild(createBookCardElement(b)));
    }

    const uploadedBooks = allBooks.filter(b => b.addedByUid === currentUser.uid);
    if (uploadedBooks.length === 0) {
        myUploadedShelf.innerHTML = `<p style="color:#666;">لم تقم برفع أي كتاب للموسوعة حتى الآن.</p>`;
    } else {
        uploadedBooks.forEach(b => myUploadedShelf.appendChild(createBookCardElement(b, true)));
    }
}

// 10. لوحة المراجعة والتحكم للإدارة (Admin Review Panel)
function renderAdminPendingList() {
    const pendingBooks = allBooks.filter(b => b.status === "pending");
    pendingBadge.textContent = pendingBooks.length;
    const listContainer = document.getElementById("pendingBooksList");
    listContainer.innerHTML = "";

    if (pendingBooks.length === 0) {
        listContainer.innerHTML = `<p style="text-align:center; padding:30px; background:white; border-radius:10px;">🎉 لا توجد كتب معلقة حالياً، تم فحص ومراجعة جميع الكتب!</p>`;
        return;
    }

    pendingBooks.forEach(book => {
        const item = document.createElement("div");
        item.className = "admin-card";
        item.innerHTML = `
            <img src="${book.coverUrl}" alt="${book.title}">
            <div class="admin-card-info">
                <span class="category-badge">${book.category}</span>
                <h4>${book.title}</h4>
                <p><strong>المؤلف:</strong> ${book.author} | <strong>رُفع بواسطة:</strong> ${book.addedByName || "مستخدم"} (${book.addedByEmail || ""})</p>
                <p style="font-size:0.88rem; color:#555; margin:6px 0;">${book.description}</p>
                <p style="font-size:0.85rem;">
                    <strong>رابط درايف المرفق:</strong> 
                    ${book.downloadLink ? `<a href="${book.downloadLink}" target="_blank">فحص الرابط</a>` : "لا يوجد رابط مرفق"}
                </p>
            </div>
            <div class="admin-card-actions">
                <button class="btn-approve-full">✅ نشر كامل (مع زر التحميل)</button>
                <button class="btn-approve-nodownload">🛡️ نشر للموسوعة فقط (إلغاء التحميل)</button>
                <button class="btn-reject">🗑️ رفض وحذف الكتاب</button>
            </div>
        `;

        item.querySelector(".btn-approve-full").onclick = async () => {
            await updateDoc(doc(db, "books", book.id), { status: "published_full" });
            fetchBooksFromFirestore();
        };

        item.querySelector(".btn-approve-nodownload").onclick = async () => {
            await updateDoc(doc(db, "books", book.id), { status: "published_no_download", downloadLink: "" });
            fetchBooksFromFirestore();
        };

        item.querySelector(".btn-reject").onclick = async () => {
            if (confirm(`هل أنت متأكد من حذف ورفض كتاب «${book.title}»؟`)) {
                await deleteDoc(doc(db, "books", book.id));
                fetchBooksFromFirestore();
            }
        };

        listContainer.appendChild(item);
    });
}

// تشغيل النظام عند فتح الصفحة
fetchBooksFromFirestore();
