const state = {
  room: new URLSearchParams(window.location.search).get('room') || (localStorage.getItem('cityport_session_active') === 'true' ? localStorage.getItem('cityport_room') : '') || '',
  guest: null,
  location: null,
  idToken: null,
  guestName: localStorage.getItem('cityport_guest_name') || '',
  needsGuestLogin: true,
  validationError: null,
  validationDetails: null,
  validationReason: null,
  serverCode: null,
  loginError: null,
  language: getBrowserLanguage(),
  theme: localStorage.getItem('cityport_theme') === 'dark' ? 'dark' : 'light',
  rating: 0,
  view: 'home',
  taxiRequest: null,
  taxiPickup: { type: 'hotel', label: 'Cityport Hotel', latitude: 41.006323, longitude: 39.734137 },
  taxiDestination: null,
  taxiSuggestions: [],
  taxiSearchTimer: null,
  taxiSubmitting: false,
  taxiNotice: null,
  taxiPaymentMethod: 'cash',
  taxiPassengerCount: 1,
  cafeProducts: [],
  cafeCart: [],
  paymentMethod: 'cash',
  cafeCartOpen: false,
  account: null,
  accountLoading: false,
  menuOpen: false,
  notifications: [],
  notificationsOpen: false,
  notificationsLoading: false,
  notificationsError: false,
  pageTransition: false,
  justAddedId: null
};
document.documentElement.dataset.theme = state.theme;
document.documentElement.lang = state.language;

function getBrowserLanguage() {
  const supportedLanguages = ['tr', 'en', 'de', 'ru', 'ar', 'fa'];
  const browserLanguage = String(navigator.languages?.[0] || navigator.language || '').toLowerCase().split(/[-_]/)[0];
  return supportedLanguages.includes(browserLanguage) ? browserLanguage : 'en';
}

try {
  const storedTaxiRequest = JSON.parse(localStorage.getItem('cityport_taxi_request') || 'null');
  if (storedTaxiRequest && storedTaxiRequest.room === state.room && Number(storedTaxiRequest.expiresAt) > Date.now()) state.taxiRequest = storedTaxiRequest;
  else localStorage.removeItem('cityport_taxi_request');
} catch (error) {
  localStorage.removeItem('cityport_taxi_request');
}
function updateNotificationBadge() {
  const button = document.querySelector('[data-notifications-open]');
  if (!button) return;
  const unreadCount = state.notifications.filter(item => !item.read).length;
  button.querySelector('.notification-count')?.remove();
  if (unreadCount) {
    const badge = document.createElement('span');
    badge.className = 'notification-count';
    badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    button.appendChild(badge);
  }
  button.setAttribute('aria-label', `${ft('notifications')}${unreadCount ? ` (${unreadCount})` : ''}`);
}
function startNotificationRefresh() {
  if (notificationRefreshTimer) window.clearInterval(notificationRefreshTimer);
  notificationRefreshTimer = window.setInterval(async () => {
    if (!state.guest || state.notificationsOpen) return;
    try {
      const result = await notificationRequest('list');
      state.notifications = result.items || [];
      if (syncTaxiStatus(state.notifications) && state.view === 'taxi') render();
      updateNotificationBadge();
    } catch (error) {
      console.error('[Cityport] Background notification refresh failed:', error?.message || error);
    }
  }, 60000);
}

const hotel = {
  name: 'Cityport Hotel',
  logo: 'https://cityporthotel.com/wp-content/uploads/2021/04/city-port-mini-1.png',
  breakfast: '07:30 - 10:00',
  wifiName: 'CITYPORTHOTEL',
  wifiPassword: '123456789',
  whatsapp: '+905469056161',
  phone: '+904623267282',
  website: 'http://cityporthotel.com/',
  instagram: 'https://www.instagram.com/cityport.hotel/'
};
const firebaseWebApiKey = 'AIzaSyAVSkmo77MV4nQWsvXUHJ2gNqU5IsgmL4w';
const firebaseConfig = {
  apiKey: firebaseWebApiKey,
  authDomain: 'hotelss-5d21e.firebaseapp.com',
  databaseURL: 'https://hotelss-5d21e-default-rtdb.firebaseio.com',
  projectId: 'hotelss-5d21e',
  storageBucket: 'hotelss-5d21e.firebasestorage.app',
  messagingSenderId: '690208902258',
  appId: '1:690208902258:web:e340e732a111fa6df306eb'
};
const publicVapidKey = 'BNoFkB-xnSyDoq_T8iYcg3o33rcMMfg66XOkMIYZ_BFxn9RkQrKCaWyx2AEHjeKcp9WfXNjOQPVm3jLLpcQ56H4';
let firebaseMessaging = null;
let pushRegistration = null;
let deferredInstallPrompt = null;
let notificationRefreshTimer = null;
try {
  if (window.firebase?.apps?.length) firebaseMessaging = window.firebase.messaging();
  else if (window.firebase) {
    window.firebase.initializeApp(firebaseConfig);
    firebaseMessaging = window.firebase.messaging();
  }
} catch (error) {
  console.warn('[Cityport] Web push is unavailable:', error?.message || error);
}
const notificationTranslations = {
  tr: { title: 'Bildirimleri açın', text: 'Checkout hatırlatmaları ve otel duyurularını alın.', enable: 'Bildirimleri etkinleştir', installTitle: 'Uygulamayı yükleyin', installText: 'iPhone’da bildirim almak için önce bu siteyi Ana Ekran’a ekleyin.', installHelp: 'Paylaş → Ana Ekran’a Ekle', later: 'Daha sonra' },
  en: { title: 'Turn on notifications', text: 'Receive checkout reminders and hotel updates.', enable: 'Enable notifications', installTitle: 'Install the app', installText: 'On iPhone, add this site to your Home Screen before enabling notifications.', installHelp: 'Share → Add to Home Screen', later: 'Later' },
  de: { title: 'Benachrichtigungen aktivieren', text: 'Erhalten Sie Abreise-Erinnerungen und Hotelinformationen.', enable: 'Benachrichtigungen aktivieren', installTitle: 'App installieren', installText: 'Fügen Sie diese Website auf dem iPhone zuerst zum Home-Bildschirm hinzu.', installHelp: 'Teilen → Zum Home-Bildschirm', later: 'Später' },
  ru: { title: 'Включить уведомления', text: 'Получайте напоминания о выезде и новости отеля.', enable: 'Включить уведомления', installTitle: 'Установите приложение', installText: 'На iPhone сначала добавьте сайт на главный экран.', installHelp: 'Поделиться → На экран «Домой»', later: 'Позже' },
  ar: { title: 'فعّل الإشعارات', text: 'احصل على تذكيرات المغادرة وتحديثات الفندق.', enable: 'تفعيل الإشعارات', installTitle: 'ثبّت التطبيق', installText: 'على iPhone أضف الموقع إلى الشاشة الرئيسية أولاً.', installHelp: 'مشاركة ← إضافة إلى الشاشة الرئيسية', later: 'لاحقاً' },
  fa: { title: 'اعلان‌ها را فعال کنید', text: 'یادآوری خروج و اطلاعیه‌های هتل را دریافت کنید.', enable: 'فعال‌سازی اعلان‌ها', installTitle: 'برنامه را نصب کنید', installText: 'در آیفون ابتدا سایت را به صفحه اصلی اضافه کنید.', installHelp: 'اشتراک‌گذاری ← افزودن به صفحه اصلی', later: 'بعداً' }
};
function notificationText(key) { return (notificationTranslations[state.language] || notificationTranslations.tr)[key]; }
const roomEntryTranslations = {
  tr: { title: 'Oda numaranızı yazın', text: 'Cityport Hotel misafir hizmetlerine devam etmek için oda numaranızı girin.', room: 'Oda numarası', continue: 'Devam et', invalid: 'Geçerli bir oda numarası yazın.', cafe: 'CAFE PORT', cafeText: 'Odanıza istediğiniz ürünleri söyleyin.', account: 'Oda hesabı', accountTitle: 'Oda hesabınız', accountLoading: 'Hesabınız yükleniyor...', accountEmpty: 'Henüz talep veya sipariş bulunmuyor.', history: 'Geçmiş', total: 'Toplam', quantity: 'Adet', decrease: 'Azalt', clearCart: 'Sepeti boşalt', order: 'Sipariş ver', cartEmpty: 'Sepetiniz boş.', menuLoading: 'Kafe menüsü yükleniyor...', menuError: 'Kafe menüsü şu anda alınamadı.', orderRecordedNotNotified: 'Siparişiniz kaydedildi ancak resepsiyona bildirilemedi. Lütfen tekrar sipariş vermeyin; resepsiyonla iletişime geçin.' },
  en: { title: 'Enter your room number', text: 'Enter your room number to continue to Cityport Hotel guest services.', room: 'Room number', continue: 'Continue', invalid: 'Enter a valid room number.', cafe: 'Cafe', cafeText: 'Order what you need to your room.', account: 'Room account', accountTitle: 'Your room account', accountLoading: 'Loading your account...', accountEmpty: 'There are no requests or orders yet.', history: 'History', total: 'Total', quantity: 'Qty', decrease: 'Decrease', clearCart: 'Clear cart', order: 'Place order', cartEmpty: 'Your cart is empty.', menuLoading: 'Loading cafe menu...', menuError: 'The cafe menu is currently unavailable.', orderRecordedNotNotified: 'Your order was saved, but reception could not be notified. Please do not place it again; contact reception.' },
  de: { title: 'Zimmernummer eingeben', text: 'Geben Sie Ihre Zimmernummer ein, um zu den Gästeservices des Cityport Hotels zu gelangen.', room: 'Zimmernummer', continue: 'Weiter', invalid: 'Geben Sie eine gültige Zimmernummer ein.', cafe: 'Café', cafeText: 'Bestellen Sie, was Sie auf Ihrem Zimmer benötigen.', account: 'Zimmerkonto', accountTitle: 'Ihr Zimmerkonto', accountLoading: 'Konto wird geladen...', accountEmpty: 'Noch keine Anfragen oder Bestellungen.', history: 'Verlauf', total: 'Gesamt', quantity: 'Menge', decrease: 'Verringern', clearCart: 'Warenkorb leeren', order: 'Bestellung senden', cartEmpty: 'Ihr Warenkorb ist leer.', menuLoading: 'Café-Menü wird geladen...', menuError: 'Das Café-Menü ist derzeit nicht verfügbar.', orderRecordedNotNotified: 'Ihre Bestellung wurde gespeichert, aber die Rezeption wurde nicht benachrichtigt. Bitte bestellen Sie nicht erneut und wenden Sie sich an die Rezeption.' },
  ru: { title: 'Введите номер комнаты', text: 'Введите номер комнаты, чтобы перейти к услугам Cityport Hotel.', room: 'Номер комнаты', continue: 'Продолжить', invalid: 'Введите корректный номер комнаты.', cafe: 'Кафе', cafeText: 'Закажите необходимое в номер.', account: 'Счёт номера', accountTitle: 'Счёт вашего номера', accountLoading: 'Счёт загружается...', accountEmpty: 'Запросов и заказов пока нет.', history: 'История', total: 'Итого', quantity: 'Количество', decrease: 'Уменьшить', clearCart: 'Очистить корзину', order: 'Оформить заказ', cartEmpty: 'Корзина пуста.', menuLoading: 'Меню кафе загружается...', menuError: 'Меню кафе сейчас недоступно.', orderRecordedNotNotified: 'Заказ сохранён, но ресепшен не получил уведомление. Пожалуйста, не отправляйте заказ повторно и свяжитесь с ресепшеном.' },
  ar: { title: 'أدخل رقم الغرفة', text: 'أدخل رقم غرفتك للمتابعة إلى خدمات ضيوف Cityport Hotel.', room: 'رقم الغرفة', continue: 'متابعة', invalid: 'أدخل رقم غرفة صحيحاً.', cafe: 'المقهى', cafeText: 'اطلب ما تحتاجه إلى غرفتك.', account: 'حساب الغرفة', accountTitle: 'حساب غرفتك', accountLoading: 'جارٍ تحميل الحساب...', accountEmpty: 'لا توجد طلبات أو حجوزات بعد.', history: 'السجل', total: 'الإجمالي', quantity: 'الكمية', decrease: 'تقليل', clearCart: 'إفراغ السلة', order: 'إرسال الطلب', cartEmpty: 'السلة فارغة.', menuLoading: 'جارٍ تحميل قائمة المقهى...', menuError: 'قائمة المقهى غير متاحة حالياً.', orderRecordedNotNotified: 'تم حفظ طلبك، لكن تعذّر إخطار الاستقبال. يُرجى عدم إرسال الطلب مرة أخرى والتواصل مع الاستقبال.' },
  fa: { title: 'شماره اتاق را وارد کنید', text: 'برای ادامه به خدمات مهمان Cityport Hotel شماره اتاق را وارد کنید.', room: 'شماره اتاق', continue: 'ادامه', invalid: 'یک شماره اتاق معتبر وارد کنید.', cafe: 'کافه', cafeText: 'نیازهای خود را به اتاق سفارش دهید.', account: 'حساب اتاق', accountTitle: 'حساب اتاق شما', accountLoading: 'در حال بارگذاری حساب...', accountEmpty: 'هنوز درخواست یا سفارشی وجود ندارد.', history: 'سوابق', total: 'مجموع', quantity: 'تعداد', decrease: 'کاهش', clearCart: 'خالی کردن سبد', order: 'ثبت سفارش', cartEmpty: 'سبد شما خالی است.', menuLoading: 'در حال بارگذاری منوی کافه...', menuError: 'منوی کافه در حال حاضر در دسترس نیست.', orderRecordedNotNotified: 'سفارش شما ذخیره شد، اما پذیرش مطلع نشد. لطفاً سفارش را دوباره ارسال نکنید و با پذیرش تماس بگیرید.' }
};
function roomText(key) { return (roomEntryTranslations[state.language] || roomEntryTranslations.tr)[key]; }
function isIosDevice() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function isStandalonePwa() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
function installBrowser() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (isIosDevice()) return 'ios';
  if (/android/.test(userAgent) && /edg\//.test(userAgent)) return 'edgeAndroid';
  if (/android/.test(userAgent) && /chrome\//.test(userAgent)) return 'chromeAndroid';
  if (/edg\//.test(userAgent)) return 'edge';
  if (/firefox/.test(userAgent)) return 'firefox';
  if (/safari/.test(userAgent) && !/chrome|android/.test(userAgent)) return 'safari';
  if (/chrome/.test(userAgent)) return 'chrome';
  return 'other';
}
const installTranslations = {
  tr: { title: 'Uygulamayı telefonunuza ekleyin', intro: 'Otel hizmetlerine ve bildirimlere daha hızlı ulaşmak için Cityport Hotel’i uygulama olarak ekleyin.', ios: 'Safari’de Paylaş düğmesine dokunun, ardından “Ana Ekran’a Ekle” seçeneğini seçin.', chromeAndroid: 'Chrome’da sağ üstteki üç noktaya dokunun ve “Uygulamayı yükle” veya “Ana ekrana ekle” seçeneğini seçin.', edgeAndroid: 'Edge menüsünü açın ve “Telefona ekle” veya “Uygulamayı yükle” seçeneğini seçin.', chrome: 'Adres çubuğunun sağındaki yükleme simgesine tıklayın veya Chrome menüsünden “Cityport Hotel’i yükle” seçeneğini seçin.', edge: 'Adres çubuğundaki uygulama simgesine tıklayın veya Edge menüsünden uygulamayı yükleyin.', safari: 'Safari menüsünden Dosya > Dock’a Ekle seçeneğini seçin.', firefox: 'Firefox menüsünü açın ve cihazınızda “Ana ekrana ekle” seçeneğini arayın.', other: 'Tarayıcınızın menüsünü açın ve “Ana ekrana ekle” veya “Uygulamayı yükle” seçeneğini arayın.', install: 'Uygulamayı yükle', notificationTitle: 'Bildirimleri de açın', notificationText: 'Bildirimleri açarak çıkış hatırlatmalarını ve otel duyurularını alın.', notificationAction: 'Bildirimleri etkinleştir', later: 'Daha sonra' },
  en: { title: 'Add the app to your device', intro: 'Add Cityport Hotel as an app for faster access to hotel services and notifications.', ios: 'In Safari, tap Share, then choose “Add to Home Screen”.', chromeAndroid: 'In Chrome, tap the three dots and choose “Install app” or “Add to Home screen”.', edgeAndroid: 'Open the Edge menu and choose “Add to phone” or “Install app”.', chrome: 'Click the install icon on the right of the address bar, or choose “Install Cityport Hotel” from the Chrome menu.', edge: 'Click the app icon in the address bar, or install the app from the Edge menu.', safari: 'In Safari, choose File > Add to Dock.', firefox: 'Open the Firefox menu and look for “Add to Home screen” on your device.', other: 'Open your browser menu and look for “Add to Home screen” or “Install app”.', install: 'Install the app', notificationTitle: 'Turn on notifications too', notificationText: 'Enable notifications to receive checkout reminders and hotel updates.', notificationAction: 'Enable notifications', later: 'Later' },
  de: { title: 'App zum Gerät hinzufügen', intro: 'Fügen Sie Cityport Hotel als App hinzu, um schneller auf Hoteldienste und Benachrichtigungen zuzugreifen.', ios: 'Tippen Sie in Safari auf Teilen und wählen Sie „Zum Home-Bildschirm“.', chromeAndroid: 'Tippen Sie in Chrome auf die drei Punkte und wählen Sie „App installieren“ oder „Zum Startbildschirm hinzufügen“.', edgeAndroid: 'Öffnen Sie das Edge-Menü und wählen Sie „Zum Telefon hinzufügen“ oder „App installieren“.', chrome: 'Klicken Sie rechts in der Adressleiste auf das Installationssymbol oder wählen Sie „Cityport Hotel installieren“ im Chrome-Menü.', edge: 'Klicken Sie auf das App-Symbol in der Adressleiste oder installieren Sie die App über das Edge-Menü.', safari: 'Wählen Sie in Safari Datei > Zum Dock hinzufügen.', firefox: 'Öffnen Sie das Firefox-Menü und suchen Sie auf Ihrem Gerät nach „Zum Startbildschirm hinzufügen“.', other: 'Öffnen Sie das Browsermenü und suchen Sie nach „Zum Startbildschirm hinzufügen“ oder „App installieren“.', install: 'App installieren', notificationTitle: 'Benachrichtigungen ebenfalls aktivieren', notificationText: 'Aktivieren Sie Benachrichtigungen für Abreise-Erinnerungen und Hotelinformationen.', notificationAction: 'Benachrichtigungen aktivieren', later: 'Später' },
  ru: { title: 'Добавьте приложение на устройство', intro: 'Добавьте Cityport Hotel как приложение для быстрого доступа к услугам отеля и уведомлениям.', ios: 'В Safari нажмите «Поделиться», затем выберите «На экран «Домой»».', chromeAndroid: 'В Chrome нажмите на три точки и выберите «Установить приложение» или «Добавить на главный экран».', edgeAndroid: 'Откройте меню Edge и выберите «Добавить на телефон» или «Установить приложение».', chrome: 'Нажмите значок установки справа в адресной строке или выберите «Установить Cityport Hotel» в меню Chrome.', edge: 'Нажмите значок приложения в адресной строке или установите его через меню Edge.', safari: 'В Safari выберите Файл > Добавить в Dock.', firefox: 'Откройте меню Firefox и найдите на устройстве пункт «На главный экран».', other: 'Откройте меню браузера и найдите «На главный экран» или «Установить приложение».', install: 'Установить приложение', notificationTitle: 'Также включите уведомления', notificationText: 'Включите уведомления, чтобы получать напоминания о выезде и новости отеля.', notificationAction: 'Включить уведомления', later: 'Позже' },
  ar: { title: 'أضف التطبيق إلى جهازك', intro: 'أضف Cityport Hotel كتطبيق للوصول بسرعة إلى خدمات الفندق والإشعارات.', ios: 'في Safari اضغط «مشاركة»، ثم اختر «إضافة إلى الشاشة الرئيسية».', chromeAndroid: 'في Chrome اضغط على النقاط الثلاث واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».', edgeAndroid: 'افتح قائمة Edge واختر «إضافة إلى الهاتف» أو «تثبيت التطبيق».', chrome: 'اضغط رمز التثبيت بجانب شريط العنوان أو اختر «تثبيت Cityport Hotel» من قائمة Chrome.', edge: 'اضغط رمز التطبيق في شريط العنوان أو ثبّت التطبيق من قائمة Edge.', safari: 'في Safari اختر ملف > إضافة إلى Dock.', firefox: 'افتح قائمة Firefox وابحث في جهازك عن «إضافة إلى الشاشة الرئيسية».', other: 'افتح قائمة المتصفح وابحث عن «إضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق».', install: 'تثبيت التطبيق', notificationTitle: 'فعّل الإشعارات أيضاً', notificationText: 'فعّل الإشعارات للحصول على تذكيرات المغادرة وتحديثات الفندق.', notificationAction: 'تفعيل الإشعارات', later: 'لاحقاً' },
  fa: { title: 'برنامه را به دستگاه خود اضافه کنید', intro: 'Cityport Hotel را به‌صورت برنامه اضافه کنید تا سریع‌تر به خدمات هتل و اعلان‌ها دسترسی داشته باشید.', ios: 'در Safari روی اشتراک‌گذاری بزنید و سپس «افزودن به صفحه اصلی» را انتخاب کنید.', chromeAndroid: 'در Chrome روی سه نقطه بزنید و «نصب برنامه» یا «افزودن به صفحه اصلی» را انتخاب کنید.', edgeAndroid: 'منوی Edge را باز کنید و «افزودن به تلفن» یا «نصب برنامه» را انتخاب کنید.', chrome: 'روی نماد نصب در سمت راست نوار آدرس کلیک کنید یا از منوی Chrome گزینه «نصب Cityport Hotel» را انتخاب کنید.', edge: 'روی نماد برنامه در نوار آدرس کلیک کنید یا از منوی Edge برنامه را نصب کنید.', safari: 'در Safari گزینه File > Add to Dock را انتخاب کنید.', firefox: 'منوی Firefox را باز کنید و در دستگاه خود گزینه «افزودن به صفحه اصلی» را پیدا کنید.', other: 'منوی مرورگر را باز کنید و گزینه «افزودن به صفحه اصلی» یا «نصب برنامه» را پیدا کنید.', install: 'نصب برنامه', notificationTitle: 'اعلان‌ها را هم فعال کنید', notificationText: 'اعلان‌ها را برای دریافت یادآوری خروج و اطلاعیه‌های هتل فعال کنید.', notificationAction: 'فعال‌سازی اعلان‌ها', later: 'بعداً' }
};
function installText(key) { return (installTranslations[state.language] || installTranslations.tr)[key]; }
function firstVisitInstallModal() {
  if (!state.guest || isStandalonePwa() || localStorage.getItem('cityport_install_prompt_seen') === 'true') return '';
  const browser = installBrowser();
  const nativeInstallAction = deferredInstallPrompt ? `<button class="btn" data-install-app type="button">${installText('install')}</button>` : '';
  const notificationAction = firebaseMessaging && 'Notification' in window && Notification.permission !== 'granted' ? `<button class="btn secondary" data-enable-notifications type="button">${installText('notificationAction')}</button>` : '';
  return `<div class="modal-backdrop install-modal-backdrop" data-install-modal><section class="success-modal install-modal" role="dialog" aria-modal="true" aria-labelledby="install-title"><button class="modal-close" data-install-later type="button" aria-label="${installText('later')}">×</button><div class="success-mark">↗</div><p class="eyebrow">Cityport Hotel</p><h2 id="install-title">${installText('title')}</h2><p>${installText('intro')}</p><div class="install-steps"><strong>${installText('install')}</strong><span>${installText(browser)}</span></div><div class="install-notification"><strong>${installText('notificationTitle')}</strong><p>${installText('notificationText')}</p>${notificationAction}</div><div class="confirmation-actions">${nativeInstallAction}<button class="btn ghost" data-install-later type="button">${installText('later')}</button></div></section></div>`;
}
function notificationBanner() {
  if (!state.guest) return '';
  if (isIosDevice() && !isStandalonePwa()) return `<aside class="notification-banner" data-install-banner><strong>${notificationText('installTitle')}</strong><p>${notificationText('installText')}</p><small>${notificationText('installHelp')}</small><button class="banner-dismiss" data-banner-dismiss type="button">${notificationText('later')}</button></aside>`;
  if (!firebaseMessaging || !('Notification' in window)) return '';
  if (Notification.permission === 'granted' || localStorage.getItem('cityport_push_enabled') === 'true') return '';
  if (Notification.permission === 'denied') return '';
  return `<aside class="notification-banner" data-notification-banner><strong>${notificationText('title')}</strong><p>${notificationText('text')}</p><button class="btn" data-enable-notifications type="button">${notificationText('enable')}</button><button class="banner-dismiss" data-banner-dismiss type="button">${notificationText('later')}</button></aside>`;
}
async function enableNotifications() {
  if (!firebaseMessaging || !('Notification' in window)) return;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') { render(); return; }
  pushRegistration = await navigator.serviceWorker.ready;
  const token = await firebaseMessaging.getToken({ vapidKey: publicVapidKey, serviceWorkerRegistration: pushRegistration });
  if (!token) throw new Error('push_token_missing');
  const response = await fetch('/api/push-subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, room: state.room, guestName: state.guestName, checkoutDate: state.guest?.checkoutDate, language: state.language, idToken: state.idToken }) });
  if (!response.ok) throw new Error('push_subscription_failed');
  localStorage.setItem('cityport_push_enabled', 'true');
  render();
}
const offlineTranslations = {
  tr: { title: 'Çevrimdışı kullanım', text: 'İnternet bağlantısı yok. Wi-Fi bilgilerini kullanabilirsiniz.', wifi: 'Wi-Fi bilgileri', reconnect: 'Bağlantı gelince tekrar deneyin.' },
  en: { title: 'Offline mode', text: 'There is no internet connection. You can use the Wi-Fi details below.', wifi: 'Wi-Fi details', reconnect: 'Try again when you are online.' },
  de: { title: 'Offline-Modus', text: 'Keine Internetverbindung. Die WLAN-Daten sind unten verfügbar.', wifi: 'WLAN-Daten', reconnect: 'Versuchen Sie es erneut, sobald Sie online sind.' },
  ru: { title: 'Офлайн-режим', text: 'Нет подключения к интернету. Данные Wi-Fi доступны ниже.', wifi: 'Данные Wi-Fi', reconnect: 'Повторите попытку после восстановления связи.' },
  ar: { title: 'وضع عدم الاتصال', text: 'لا يوجد اتصال بالإنترنت. يمكنك استخدام بيانات Wi-Fi أدناه.', wifi: 'بيانات Wi-Fi', reconnect: 'حاول مرة أخرى عند عودة الاتصال.' },
  fa: { title: 'حالت آفلاین', text: 'اتصال اینترنت وجود ندارد. می‌توانید از اطلاعات Wi-Fi زیر استفاده کنید.', wifi: 'اطلاعات Wi-Fi', reconnect: 'پس از برقراری اتصال دوباره تلاش کنید.' }
};
function offlineText(key) { return (offlineTranslations[state.language] || offlineTranslations.tr)[key]; }
const menuTranslations = {
  tr: { open: 'Menüyü aç', close: 'Menüyü kapat', title: 'Misafir menüsü', home: 'Ana sayfa', cafe: 'Cafe', account: 'Oda hesabı', tours: 'Turlar', guide: 'Trabzon hakkında', request: 'Talep', issue: 'Arıza', taxi: 'Taksi', review: 'Geri bildirim', contact: 'İletişim', logout: 'Çıkış yap' },
  en: { open: 'Open menu', close: 'Close menu', title: 'Guest menu', home: 'Home', cafe: 'Cafe', account: 'Room account', tours: 'Tours', guide: 'About Trabzon', request: 'Request', issue: 'Issue', taxi: 'Taxi', review: 'Feedback', contact: 'Contact', logout: 'Sign out' },
  de: { open: 'Menü öffnen', close: 'Menü schließen', title: 'Gästemenü', home: 'Startseite', cafe: 'Café', account: 'Zimmerkonto', tours: 'Touren', guide: 'Über Trabzon', request: 'Anfrage', issue: 'Störung', taxi: 'Taxi', review: 'Feedback', contact: 'Kontakt', logout: 'Abmelden' },
  ru: { open: 'Открыть меню', close: 'Закрыть меню', title: 'Меню гостя', home: 'Главная', cafe: 'Кафе', account: 'Счёт номера', tours: 'Туры', guide: 'О Трабзоне', request: 'Запрос', issue: 'Проблема', taxi: 'Такси', review: 'Отзывы', contact: 'Контакты', logout: 'Выйти' },
  ar: { open: 'فتح القائمة', close: 'إغلاق القائمة', title: 'قائمة الضيف', home: 'الرئيسية', cafe: 'المقهى', account: 'حساب الغرفة', tours: 'الجولات', guide: 'عن طرابزون', request: 'طلب', issue: 'عطل', taxi: 'سيارة أجرة', review: 'ملاحظات', contact: 'اتصل بنا', logout: 'تسجيل الخروج' },
  fa: { open: 'باز کردن منو', close: 'بستن منو', title: 'منوی مهمان', home: 'خانه', cafe: 'کافه', account: 'حساب اتاق', tours: 'تورها', guide: 'درباره ترابزون', request: 'درخواست', issue: 'خرابی', taxi: 'تاکسی', review: 'بازخورد', contact: 'تماس', logout: 'خروج' }
};
function menuText(key) { return (menuTranslations[state.language] || menuTranslations.tr)[key]; }
const guideUiTranslations = {
  tr: { more: 'Daha fazla', tip: 'Konaklamanıza uygun rota için resepsiyondan bilgi alın.' },
  en: { more: 'See more', tip: 'Ask reception for a route tailored to your stay.' },
  de: { more: 'Mehr anzeigen', tip: 'Fragen Sie an der Rezeption nach einer passenden Route.' },
  ru: { more: 'Смотреть больше', tip: 'На ресепшене подберут маршрут для вашего проживания.' },
  ar: { more: 'عرض المزيد', tip: 'اسأل الاستقبال عن مسار مناسب لإقامتك.' },
  fa: { more: 'مشاهده بیشتر', tip: 'برای مسیر مناسب اقامت خود از پذیرش راهنمایی بگیرید.' }
};
function guideUiText(key) { return (guideUiTranslations[state.language] || guideUiTranslations.tr)[key]; }

const translations = {
  tr: { language: 'Dil seçimi', verifying: 'Oturumunuz doğrulanıyor.', locationRequired: 'Otel hizmetlerine erişim için konum izni gerekiyor.', accessDenied: 'Erişim doğrulanamadı.', nearHotel: 'Konumunuz otelden uzak görünüyor.', lowAccuracy: 'Telefonunuz yalnızca yaklaşık konum verdi.', locationHelp: 'Konum izni gerekli.', ended: 'Konaklamanız sona ermiş veya oda aktif değil.', serverError: 'Sunucu Firebase oda verisini okuyamadı. Vercel Environment Variables içindeki Firebase server credential değerlerini kontrol edin.', callReception: 'Resepsiyonu ara', guestExperience: 'Misafir deneyimi', welcome: 'hoş geldiniz.', access: 'Otel hizmetlerine erişin.', today: 'Bugün için', breakfast: 'Kahvaltı', sendRequest: 'Talep Gönder', reportIssue: 'Arıza Bildir', contact: 'Bize Ulaşın', createRequest: 'Yeni talep oluştur', cleaning: 'Temizlik iste', explore: "Trabzon'u keşfedin", review: 'Değerlendirme yap', back: 'Ana sayfa', submit: 'Gönder', note: 'Notunuz', category: 'Kategori', rating: 'Puanınızı seçin.', guestName: 'Ad soyad', guestNameHelp: 'Rezervasyonunuzdaki ad soyadınızı yazın.', continue: 'Devam et', retry: 'Tekrar dene', authError: 'Giriş başlatılamadı. Lütfen tekrar deneyin.', nameMismatch: 'Ad soyad oda kaydıyla eşleşmedi. Lütfen tekrar deneyin veya resepsiyona başvurun.' },
  en: { language: 'Language', verifying: 'Verifying your session.', locationRequired: 'Location permission is required to access hotel services.', accessDenied: 'Access could not be verified.', nearHotel: 'Your location appears to be too far from the hotel.', lowAccuracy: 'Your phone provided only an approximate location.', locationHelp: 'Location permission is required.', ended: 'Your stay may have ended or the room is not active.', serverError: 'The server could not read the Firebase room data. Check the Firebase server credential variables in Vercel.', callReception: 'Call reception', guestExperience: 'Guest experience', welcome: 'welcome.', access: 'Access your hotel services.', today: 'Today', breakfast: 'Breakfast', sendRequest: 'Send request', reportIssue: 'Report issue', contact: 'Contact us', createRequest: 'Create a request', cleaning: 'Request cleaning', explore: 'Explore Trabzon', review: 'Leave a review', back: 'Home', submit: 'Submit', note: 'Your note', category: 'Category', rating: 'Choose your rating.', guestName: 'Full name', guestNameHelp: 'Enter the name used for your reservation.', continue: 'Continue', retry: 'Try again', authError: 'Could not start sign-in. Please try again.', nameMismatch: 'The name does not match the room record. Please try again or contact reception.' },
  de: { language: 'Sprache', verifying: 'Sitzung wird überprüft.', guestName: 'Vollständiger Name', guestNameHelp: 'Geben Sie den Namen Ihrer Reservierung ein.', continue: 'Weiter', retry: 'Erneut versuchen', authError: 'Anmeldung konnte nicht gestartet werden.', nameMismatch: 'Der Name stimmt nicht mit dem Zimmerdatensatz überein.', locationRequired: 'Für die Hoteldienste ist eine Standortfreigabe erforderlich.', accessDenied: 'Zugriff konnte nicht bestätigt werden.', nearHotel: 'Ihr Standort scheint zu weit vom Hotel entfernt zu sein.', lowAccuracy: 'Ihr Telefon liefert nur einen ungefähren Standort.', locationHelp: 'Standortfreigabe erforderlich.', ended: 'Ihr Aufenthalt ist möglicherweise beendet.', callReception: 'Rezeption anrufen', guestExperience: 'Gasterlebnis', welcome: 'willkommen.', access: 'Hotelservices nutzen.', today: 'Heute', breakfast: 'Frühstück', sendRequest: 'Anfrage senden', reportIssue: 'Störung melden', contact: 'Kontakt', createRequest: 'Anfrage erstellen', cleaning: 'Reinigung anfordern', explore: 'Trabzon entdecken', review: 'Bewertung abgeben', back: 'Startseite', submit: 'Senden', note: 'Ihre Notiz', category: 'Kategorie', rating: 'Bewertung auswählen.' },
  ru: { language: 'Язык', verifying: 'Проверяем сеанс.', guestName: 'Имя и фамилия', guestNameHelp: 'Введите имя из бронирования.', continue: 'Продолжить', retry: 'Повторить', authError: 'Не удалось начать вход.', nameMismatch: 'Имя не совпадает с данными номера.', locationRequired: 'Для доступа к услугам отеля необходимо разрешение на геолокацию.', accessDenied: 'Доступ не подтверждён.', nearHotel: 'Ваше местоположение слишком далеко.', lowAccuracy: 'Телефон передаёт приблизительное местоположение.', locationHelp: 'Требуется разрешение на геолокацию.', ended: 'Ваше проживание могло закончиться.', callReception: 'Позвонить на ресепшен', guestExperience: 'Гостевой сервис', welcome: 'добро пожаловать.', access: 'Доступ к услугам отеля.', today: 'Сегодня', breakfast: 'Завтрак', sendRequest: 'Отправить запрос', reportIssue: 'Сообщить о проблеме', contact: 'Связаться с нами', createRequest: 'Создать запрос', cleaning: 'Запросить уборку', explore: 'Открыть Трабзон', review: 'Оставить отзыв', back: 'Главная', submit: 'Отправить', note: 'Ваш комментарий', category: 'Категория', rating: 'Выберите оценку.' },
  ar: { language: 'اللغة', verifying: 'جارٍ التحقق من الجلسة.', guestName: 'الاسم الكامل', guestNameHelp: 'اكتب الاسم الموجود في الحجز.', continue: 'متابعة', retry: 'حاول مرة أخرى', authError: 'تعذر بدء تسجيل الدخول.', nameMismatch: 'الاسم لا يطابق بيانات الغرفة.', locationRequired: 'يلزم السماح بالموقع للوصول إلى خدمات الفندق.', accessDenied: 'تعذر التحقق من الوصول.', nearHotel: 'يبدو أنك بعيد عن الفندق.', lowAccuracy: 'يعطي الهاتف موقعاً تقريبياً.', locationHelp: 'يلزم السماح بالموقع.', ended: 'ربما انتهت إقامتك.', callReception: 'اتصل بالاستقبال', guestExperience: 'تجربة الضيف', welcome: 'مرحباً بك.', access: 'الوصول إلى خدمات الفندق.', today: 'اليوم', breakfast: 'الإفطار', sendRequest: 'إرسال طلب', reportIssue: 'الإبلاغ عن عطل', contact: 'تواصل معنا', createRequest: 'إنشاء طلب', cleaning: 'طلب التنظيف', explore: 'اكتشف طرابزون', review: 'قيّم تجربتك', back: 'الرئيسية', submit: 'إرسال', note: 'ملاحظتك', category: 'الفئة', rating: 'اختر تقييمك.' },
  fa: { language: 'زبان', verifying: 'در حال تأیید نشست شما هستیم.', guestName: 'نام و نام خانوادگی', guestNameHelp: 'نام ثبت‌شده در رزرو را وارد کنید.', continue: 'ادامه', retry: 'تلاش دوباره', authError: 'ورود آغاز نشد. لطفاً دوباره تلاش کنید.', nameMismatch: 'نام با اطلاعات اتاق مطابقت ندارد. لطفاً دوباره تلاش کنید یا با پذیرش تماس بگیرید.', locationRequired: 'برای دسترسی به خدمات هتل، اجازه دسترسی به موقعیت مکانی لازم است.', accessDenied: 'دسترسی تأیید نشد.', nearHotel: 'به نظر می‌رسد از هتل دور هستید.', lowAccuracy: 'گوشی شما فقط موقعیت تقریبی را ارائه کرد.', locationHelp: 'اجازه دسترسی به موقعیت مکانی لازم است.', ended: 'ممکن است اقامت شما به پایان رسیده باشد.', callReception: 'تماس با پذیرش', guestExperience: 'تجربه مهمان', welcome: 'خوش آمدید.', access: 'دسترسی به خدمات هتل.', today: 'امروز', breakfast: 'صبحانه', sendRequest: 'ارسال درخواست', reportIssue: 'گزارش خرابی', contact: 'تماس با ما', createRequest: 'ایجاد درخواست', cleaning: 'درخواست نظافت', explore: 'کشف ترابزون', review: 'ثبت نظر', back: 'صفحه اصلی', submit: 'ارسال', note: 'یادداشت شما', category: 'دسته‌بندی', rating: 'امتیاز خود را انتخاب کنید.' }
};
const featureTranslations = {
  tr: { cleaningCutoff: 'Temizlik talepleri her gün 14:00’ten önce verilmelidir. Bu saatten sonra talep alınamaz.', dailyLimit: 'Günlük 5 talep sınırına ulaştınız.', duplicate: 'Aynı talebi 10 dakika içinde tekrar gönderemezsiniz.', notifications: 'Bildirimler', noNotifications: 'Henüz bildiriminiz yok.', markRead: 'Okundu', deleteNotification: 'Sil', cash: 'Nakit', card: 'Kredi kartı', payment: 'Ödeme tercihi', paymentNote: 'Bu yalnızca ödeme tercihidir; uygulama kart bilgisi almaz veya çevrim içi tahsilat yapmaz.', add: 'Sepete ekle', quantity: 'Adet', cartTitle: 'Sipariş sepetiniz' },
  en: { cleaningCutoff: 'Cleaning requests must be submitted before 14:00 each day. Requests are unavailable after that time.', dailyLimit: 'You have reached the daily limit of five requests.', duplicate: 'You cannot send the same request again within 10 minutes.', notifications: 'Notifications', noNotifications: 'You have no notifications yet.', markRead: 'Mark as read', deleteNotification: 'Delete', cash: 'Cash', card: 'Credit card', payment: 'Payment preference', paymentNote: 'This is a payment preference only; the app does not collect card details or charge online.', add: 'Add to cart', quantity: 'Quantity', cartTitle: 'Your order cart' },
  de: { cleaningCutoff: 'Reinigungsanfragen müssen täglich vor 14:00 Uhr eingereicht werden. Danach sind keine Anfragen möglich.', dailyLimit: 'Sie haben das tägliche Limit von fünf Anfragen erreicht.', duplicate: 'Dieselbe Anfrage kann innerhalb von 10 Minuten nicht erneut gesendet werden.', notifications: 'Benachrichtigungen', noNotifications: 'Sie haben noch keine Benachrichtigungen.', markRead: 'Als gelesen markieren', deleteNotification: 'Löschen', cash: 'Barzahlung', card: 'Kreditkarte', payment: 'Zahlungspräferenz', paymentNote: 'Dies ist nur eine Zahlungspräferenz; die App erhebt keine Kartendaten und belastet keine Karte online.', add: 'In den Warenkorb', quantity: 'Menge', cartTitle: 'Ihr Warenkorb' },
  ru: { cleaningCutoff: 'Запросы на уборку принимаются ежедневно до 14:00. После этого времени отправить запрос нельзя.', dailyLimit: 'Достигнут дневной лимит — пять запросов.', duplicate: 'Нельзя повторно отправить такой же запрос в течение 10 минут.', notifications: 'Уведомления', noNotifications: 'У вас пока нет уведомлений.', markRead: 'Отметить как прочитанное', deleteNotification: 'Удалить', cash: 'Наличные', card: 'Банковская карта', payment: 'Способ оплаты', paymentNote: 'Это только предпочтение оплаты; приложение не собирает данные карты и не списывает деньги онлайн.', add: 'В корзину', quantity: 'Количество', cartTitle: 'Ваша корзина' },
  ar: { cleaningCutoff: 'يجب إرسال طلبات التنظيف قبل الساعة 14:00 يومياً. لا يمكن إرسال الطلبات بعد ذلك.', dailyLimit: 'وصلت إلى الحد اليومي وهو خمسة طلبات.', duplicate: 'لا يمكنك إرسال الطلب نفسه مرة أخرى خلال 10 دقائق.', notifications: 'الإشعارات', noNotifications: 'لا توجد إشعارات حتى الآن.', markRead: 'تحديد كمقروء', deleteNotification: 'حذف', cash: 'نقداً', card: 'بطاقة ائتمان', payment: 'تفضيل الدفع', paymentNote: 'هذا تفضيل للدفع فقط؛ لا يجمع التطبيق بيانات البطاقة ولا يجري تحصيلاً إلكترونياً.', add: 'أضف إلى السلة', quantity: 'الكمية', cartTitle: 'سلة طلبك' },
  fa: { cleaningCutoff: 'درخواست نظافت باید هر روز پیش از ساعت ۱۴:۰۰ ثبت شود. پس از این ساعت امکان ثبت درخواست نیست.', dailyLimit: 'به سقف روزانه پنج درخواست رسیده‌اید.', duplicate: 'نمی‌توانید همان درخواست را تا ۱۰ دقیقه دوباره ارسال کنید.', notifications: 'اعلان‌ها', noNotifications: 'هنوز اعلانی ندارید.', markRead: 'علامت‌گذاری به‌عنوان خوانده‌شده', deleteNotification: 'حذف', cash: 'نقدی', card: 'کارت اعتباری', payment: 'ترجیح پرداخت', paymentNote: 'این فقط ترجیح پرداخت است؛ برنامه اطلاعات کارت را دریافت نمی‌کند یا پرداخت آنلاین انجام نمی‌دهد.', add: 'افزودن به سبد', quantity: 'تعداد', cartTitle: 'سبد سفارش شما' }
};
function ft(key) { return (featureTranslations[state.language] || featureTranslations.tr)[key]; }

const lowAccuracyMessages = {
  de: 'Ihr Telefon liefert nur einen ungefähren Standort. Aktivieren Sie GPS und mobile Daten oder WLAN und versuchen Sie es im Hotel erneut.',
  ru: 'Телефон передаёт только приблизительное местоположение. Включите GPS, Wi-Fi или мобильный интернет и повторите попытку в отеле.',
  ar: 'يعطي هاتفك موقعاً تقريبياً فقط. فعّل GPS والواي فاي أو بيانات الهاتف وحاول مرة أخرى داخل الفندق.',
  fa: 'گوشی شما فقط موقعیت تقریبی را ارائه می‌کند. GPS، Wi-Fi یا اینترنت همراه را فعال کنید و دوباره داخل هتل تلاش کنید.'
};
function t(key) { return key === 'lowAccuracy' ? (lowAccuracyMessages[state.language] || translations[state.language]?.lowAccuracy || translations.tr.lowAccuracy) : (translations[state.language]?.[key] || translations.tr[key] || key); }
const staticTranslations = { fa: { website: 'وب‌سایت', instagram: 'اینستاگرام', whatsapp: 'واتساپ', mapTitle: 'موقعیت هتل سیتی‌پورت', room: 'اتاق', whatsappMessage: 'سلام، از اتاق شماره ROOM پیام می‌دهم.', taxiCancelError: 'درخواست تاکسی لغو نشد. لطفاً با پذیرش تماس بگیرید.', cleaningHistoryError: 'سوابق نظافت بررسی نشد. لطفاً دوباره تلاش کنید.' } };
function staticText(key) { return staticTranslations[state.language]?.[key] || ({ website: 'Web sitesi', instagram: 'Instagram', whatsapp: 'WhatsApp', mapTitle: 'Otel konumu', room: 'Oda', whatsappMessage: 'Merhaba, ROOM numaralı odadan yazıyorum.', taxiCancelError: 'Taksi talebi iptal edilemedi. Lütfen resepsiyonla iletişime geçin.', cleaningHistoryError: 'Temizlik geçmişi kontrol edilemedi. Lütfen tekrar deneyin.' }[key] || key); }
function whatsappMessage() { return staticText('whatsappMessage').replace('ROOM', state.room); }
const greetingTranslations = {
  tr: ['Günaydın', 'İyi günler', 'İyi akşamlar', 'İyi geceler'],
  en: ['Good morning', 'Good afternoon', 'Good evening', 'Good night'],
  de: ['Guten Morgen', 'Guten Tag', 'Guten Abend', 'Gute Nacht'],
  ru: ['Доброе утро', 'Добрый день', 'Добрый вечер', 'Доброй ночи'],
  ar: ['صباح الخير', 'نهارك سعيد', 'مساء الخير', 'تصبح على خير'],
  fa: ['صبح بخیر', 'روز بخیر', 'عصر بخیر', 'شب بخیر']
};

const content = {
  tr: { room: 'Oda', stay: 'Konaklama', checkoutToday: 'Bugün çıkış gününüz. Odanızı saat 12:00’ye kadar boşaltmanızı rica ederiz.', checkoutTime: 'Çıkış saati 12:00', clean: 'Temizlik istiyorum', dnd: 'Rahatsız etmeyin', dndOn: 'Rahatsız Etmeyin açık', quick: 'Hızlı işlemler', tours: 'Trabzon’u keşfedin', transfer: 'Havalimanı transferi ve özel turlar', transferText: 'Konforlu transfer veya size özel bir Trabzon turu için resepsiyonla iletişime geçin.', success: 'Talebiniz alındı', successText: 'Ekibimiz talebinizi aldı ve en kısa sürede ilgilenecek.', home: 'Ana ekrana dön', close: 'Kapat', night: 'İyi konaklamalar.' },
  en: { room: 'Room', stay: 'Stay', checkoutToday: 'Today is your checkout day. Please vacate your room by 12:00.', checkoutTime: 'Checkout time 12:00', clean: 'Request cleaning', dnd: 'Do not disturb', dndOn: 'Do Not Disturb is on', quick: 'Quick actions', tours: 'Discover Trabzon', transfer: 'Airport transfer and private tours', transferText: 'Contact reception for a comfortable transfer or a private Trabzon experience.', success: 'Request received', successText: 'Our team has received your request and will take care of it shortly.', home: 'Back to home', close: 'Close', night: 'Enjoy your stay.' },
  de: { room: 'Zimmer', stay: 'Aufenthalt', checkoutToday: 'Heute ist Ihr Abreisetag. Bitte verlassen Sie Ihr Zimmer bis 12:00 Uhr.', checkoutTime: 'Abreisezeit 12:00', clean: 'Reinigung anfordern', dnd: 'Bitte nicht stören', dndOn: 'Bitte nicht stören ist aktiv', quick: 'Schnellzugriff', tours: 'Trabzon entdecken', transfer: 'Flughafentransfer und private Touren', transferText: 'Für einen komfortablen Transfer oder eine private Trabzon-Tour kontaktieren Sie bitte die Rezeption.', success: 'Anfrage erhalten', successText: 'Unser Team hat Ihre Anfrage erhalten und kümmert sich bald darum.', home: 'Zur Startseite', close: 'Schließen', night: 'Genießen Sie Ihren Aufenthalt.' },
  ru: { room: 'Номер', stay: 'Проживание', checkoutToday: 'Сегодня день выезда. Пожалуйста, освободите номер до 12:00.', checkoutTime: 'Выезд в 12:00', clean: 'Запросить уборку', dnd: 'Не беспокоить', dndOn: 'Режим «Не беспокоить» включён', quick: 'Быстрые действия', tours: 'Откройте для себя Трабзон', transfer: 'Трансфер из аэропорта и частные туры', transferText: 'Свяжитесь с ресепшеном для трансфера или индивидуальной экскурсии по Трабзону.', success: 'Запрос получен', successText: 'Мы получили ваш запрос и скоро займёмся им.', home: 'На главную', close: 'Закрыть', night: 'Приятного пребывания.' },
  ar: { room: 'الغرفة', stay: 'الإقامة', checkoutToday: 'اليوم هو يوم المغادرة. يرجى إخلاء الغرفة قبل الساعة 12:00.', checkoutTime: 'وقت المغادرة 12:00', clean: 'طلب التنظيف', dnd: 'عدم الإزعاج', dndOn: 'تم تفعيل عدم الإزعاج', quick: 'إجراءات سريعة', tours: 'اكتشف طرابزون', transfer: 'النقل من المطار والجولات الخاصة', transferText: 'تواصل مع الاستقبال للحصول على نقل مريح أو جولة خاصة في طرابزون.', success: 'تم استلام الطلب', successText: 'استلم فريقنا طلبك وسيتولى الأمر قريباً.', home: 'العودة للرئيسية', close: 'إغلاق', night: 'نتمنى لك إقامة سعيدة.' },
  fa: { room: 'اتاق', stay: 'اقامت', checkoutToday: 'امروز روز خروج شماست. لطفاً اتاق را تا ساعت ۱۲:۰۰ تخلیه کنید.', checkoutTime: 'ساعت خروج ۱۲:۰۰', clean: 'درخواست نظافت', dnd: 'مزاحم نشوید', dndOn: 'حالت مزاحم نشوید فعال است', quick: 'دسترسی سریع', tours: 'ترابزون را کشف کنید', transfer: 'ترانسفر فرودگاه و تورهای خصوصی', transferText: 'برای ترانسفر راحت یا تجربه‌ای خصوصی در ترابزون با پذیرش تماس بگیرید.', success: 'درخواست دریافت شد', successText: 'تیم ما درخواست شما را دریافت کرد و به‌زودی رسیدگی می‌کند.', home: 'بازگشت به صفحه اصلی', close: 'بستن', night: 'اقامت خوبی داشته باشید.' }
};
const extraContent = {
  tr: { cleaningPrompt: 'Temizlik talebinizi ne zaman göndermek istersiniz?', now: 'Şimdi', today: 'Gün içinde', cancel: 'Vazgeç', dailyLimit: 'Bugün için temizlik talebiniz zaten alındı.', sending: 'Gönderiliyor...', genericError: 'Talep gönderilemedi. Lütfen resepsiyona başvurun.', sent: 'Talebiniz alındı.', requestOptions: ['Ekstra havlu', 'Ek yastık', 'Su / içecek', 'Oda düzenlemesi', 'Ütü talebi', 'Geç çıkış talebi', 'Diğer'], issueOptions: ['Klima', 'Banyo / lavabo', 'Sıcak su', 'TV / kumanda', 'Wi-Fi', 'Kasa', 'Aydınlatma', 'Kapı / kilit', 'Minibar', 'Diğer'] },
  en: { cleaningPrompt: 'When would you like to request cleaning?', now: 'Now', today: 'During the day', cancel: 'Cancel', dailyLimit: 'Your cleaning request for today has already been received.', sending: 'Sending...', genericError: 'The request could not be sent. Please contact reception.', sent: 'Your request was received.', requestOptions: ['Extra towels', 'Extra pillows', 'Water / drinks', 'Room arrangement', 'Ironing', 'Late checkout', 'Other'], issueOptions: ['Air conditioning', 'Bathroom / sink', 'Hot water', 'TV / remote', 'Wi-Fi', 'Safe', 'Lighting', 'Door / lock', 'Minibar', 'Other'] },
  de: { cleaningPrompt: 'Wann möchten Sie die Reinigung anfordern?', now: 'Jetzt', today: 'Im Laufe des Tages', cancel: 'Abbrechen', dailyLimit: 'Ihre Reinigungsanfrage für heute wurde bereits angenommen.', sending: 'Wird gesendet...', genericError: 'Die Anfrage konnte nicht gesendet werden. Bitte wenden Sie sich an die Rezeption.', sent: 'Ihre Anfrage wurde erhalten.', requestOptions: ['Zusätzliche Handtücher', 'Zusätzliche Kissen', 'Wasser / Getränke', 'Zimmerordnung', 'Bügeln', 'Später Check-out', 'Andere'], issueOptions: ['Klimaanlage', 'Bad / Waschbecken', 'Warmwasser', 'TV / Fernbedienung', 'WLAN', 'Safe', 'Beleuchtung', 'Tür / Schloss', 'Minibar', 'Andere'] },
  ru: { cleaningPrompt: 'Когда вы хотите заказать уборку?', now: 'Сейчас', today: 'В течение дня', cancel: 'Отмена', dailyLimit: 'Ваш запрос на уборку сегодня уже принят.', sending: 'Отправка...', genericError: 'Не удалось отправить запрос. Обратитесь на ресепшен.', sent: 'Ваш запрос получен.', requestOptions: ['Дополнительные полотенца', 'Дополнительные подушки', 'Вода / напитки', 'Уборка номера', 'Глажка', 'Поздний выезд', 'Другое'], issueOptions: ['Кондиционер', 'Ванная / раковина', 'Горячая вода', 'Телевизор / пульт', 'Wi-Fi', 'Сейф', 'Освещение', 'Дверь / замок', 'Мини-бар', 'Другое'] },
  ar: { cleaningPrompt: 'متى تريد طلب التنظيف؟', now: 'الآن', today: 'خلال اليوم', cancel: 'إلغاء', dailyLimit: 'تم استلام طلب التنظيف الخاص بك اليوم مسبقاً.', sending: 'جارٍ الإرسال...', genericError: 'تعذر إرسال الطلب. يرجى التواصل مع الاستقبال.', sent: 'تم استلام طلبك.', requestOptions: ['مناشف إضافية', 'وسائد إضافية', 'ماء / مشروبات', 'ترتيب الغرفة', 'كي الملابس', 'تسجيل مغادرة متأخر', 'أخرى'], issueOptions: ['المكيف', 'الحمام / المغسلة', 'الماء الساخن', 'التلفزيون / جهاز التحكم', 'Wi-Fi', 'الخزنة', 'الإضاءة', 'الباب / القفل', 'الميني بار', 'أخرى'] },
  fa: { cleaningPrompt: 'چه زمانی می‌خواهید درخواست نظافت را ارسال کنید؟', now: 'اکنون', today: 'در طول روز', cancel: 'لغو', dailyLimit: 'درخواست نظافت امروز شما قبلاً دریافت شده است.', sending: 'در حال ارسال...', genericError: 'درخواست ارسال نشد. لطفاً با پذیرش تماس بگیرید.', sent: 'درخواست شما دریافت شد.', requestOptions: ['حوله اضافی', 'بالش اضافی', 'آب / نوشیدنی', 'مرتب‌سازی اتاق', 'درخواست اتو', 'خروج دیرهنگام', 'سایر'], issueOptions: ['تهویه مطبوع', 'حمام / روشویی', 'آب گرم', 'تلویزیون / کنترل', 'Wi-Fi', 'صندوق امانات', 'روشنایی', 'در / قفل', 'مینی‌بار', 'سایر'] }
};
const sharedContentTranslations = {
  tr: { stay: 'Konaklama', stayDates: 'Konaklama tarihleri', roomStatus: 'Oda durumu', reviewTitle: 'Deneyiminiz bizim için önemli.', reviewPrompt: 'Puanınızı seçin.', commentLabel: 'Yorumunuz', commentPlaceholder: 'Nasıl daha iyi yardımcı olabiliriz?' },
  en: { stay: 'Stay', stayDates: 'Stay dates', roomStatus: 'Room status', reviewTitle: 'Your experience matters to us.', reviewPrompt: 'Choose your rating.', commentLabel: 'Your comment', commentPlaceholder: 'How could we serve you better?' },
  de: { stay: 'Aufenthalt', stayDates: 'Aufenthaltsdaten', roomStatus: 'Zimmerstatus', reviewTitle: 'Ihre Erfahrung ist uns wichtig.', reviewPrompt: 'Wählen Sie Ihre Bewertung.', commentLabel: 'Ihr Kommentar', commentPlaceholder: 'Wie können wir Ihnen besser helfen?' },
  ru: { stay: 'Проживание', stayDates: 'Даты проживания', roomStatus: 'Статус номера', reviewTitle: 'Ваш опыт важен для нас.', reviewPrompt: 'Выберите оценку.', commentLabel: 'Ваш комментарий', commentPlaceholder: 'Как мы можем улучшить обслуживание?' },
  ar: { stay: 'الإقامة', stayDates: 'تواريخ الإقامة', roomStatus: 'حالة الغرفة', reviewTitle: 'تجربتك مهمة لنا.', reviewPrompt: 'اختر تقييمك.', commentLabel: 'تعليقك', commentPlaceholder: 'كيف يمكننا تحسين خدمتنا؟' },
  fa: { stay: 'اقامت', stayDates: 'تاریخ اقامت', roomStatus: 'وضعیت اتاق', reviewTitle: 'تجربه شما برای ما مهم است.', reviewPrompt: 'امتیاز خود را انتخاب کنید.', commentLabel: 'نظر شما', commentPlaceholder: 'چگونه می‌توانیم خدمات بهتری ارائه کنیم؟' }
};
function c(key) { return content[state.language]?.[key] || sharedContentTranslations[state.language]?.[key] || content.tr[key] || sharedContentTranslations.tr[key] || extraContent[state.language]?.[key] || extraContent.tr[key] || key; }
const wifiLabels = { tr: ['Wi-Fi adı', 'Wi-Fi şifresi'], en: ['Wi-Fi name', 'Wi-Fi password'], de: ['WLAN-Name', 'WLAN-Passwort'], ru: ['Имя Wi-Fi', 'Пароль Wi-Fi'], ar: ['اسم Wi-Fi', 'كلمة مرور Wi-Fi'], fa: ['نام Wi-Fi', 'رمز عبور Wi-Fi'] };
function wifiLabel(index) { return (wifiLabels[state.language] || wifiLabels.tr)[index]; }
const tourContactTranslations = {
  tr: 'Fiyat ve rezervasyon için resepsiyonla iletişime geçin',
  en: 'Contact reception for pricing and reservations',
  de: 'Für Preise und Reservierungen wenden Sie sich bitte an die Rezeption',
  ru: 'По вопросам цены и бронирования обращайтесь на ресепшен',
  ar: 'للسعر والحجز يرجى التواصل مع الاستقبال',
  fa: 'برای قیمت و رزرو با پذیرش تماس بگیرید'
};
function tourContact() { return tourContactTranslations[state.language] || tourContactTranslations.tr; }

const tourContent = {
  tr: [['Sümela Turu', 'Sümela Manastırı, Zigana Dağı, Karaca Mağarası ve Hamsiköy.', 'Sümela Monastery'], ['Batum Turu', 'Gonio, Piazza, Avrupa Meydanı ve Ali & Nino.', 'Batumi'], ['Ayder Yaylası', 'Rize, Fırtına Vadisi, Çamlıhemşin ve Ayder.', 'Ayder Plateau'], ['Uzungöl Turu', 'Çay fabrikası, seyir terası ve Karadeniz manzaraları.', 'Uzungol Lake'], ['Şehir Turu', 'Trabzon’un tarihi, sahili ve yerel lezzetleri.', 'Trabzon city']],
  en: [['Sumela Tour', 'Sumela Monastery, Zigana Mountain, Karaca Cave and Hamsikoy.', 'Sumela Monastery'], ['Batumi Tour', 'Gonio, Piazza, Europe Square and Ali & Nino.', 'Batumi'], ['Ayder Plateau', 'Rize, Firtina Valley, Camlihemsin and Ayder.', 'Ayder Plateau'], ['Uzungol Tour', 'Tea factory, viewpoint and Black Sea scenery.', 'Uzungol Lake'], ['City Tour', 'Trabzon history, coastline and local flavours.', 'Trabzon city']],
  de: [['Sümela-Tour', 'Sümela-Kloster, Zigana-Gebirge, Karaca-Höhle und Hamsiköy.', 'Sumela Monastery'], ['Batumi-Tour', 'Gonio, Piazza, Europaplatz und Ali & Nino.', 'Batumi'], ['Ayder-Hochebene', 'Rize, Fırtına-Tal, Çamlıhemşin und Ayder.', 'Ayder Plateau'], ['Uzungöl-Tour', 'Teefabrik, Aussichtspunkt und Schwarzmeerlandschaft.', 'Uzungol Lake'], ['Stadtrundfahrt', 'Geschichte, Küste und lokale Spezialitäten von Trabzon.', 'Trabzon city']],
  ru: [['Тур Сумела', 'Монастырь Сумела, горы Зигана, пещера Караджa и Хамсикёй.', 'Sumela Monastery'], ['Тур Батуми', 'Гонио, Пьяцца, площадь Европы и Али и Нино.', 'Batumi'], ['Айдерское плато', 'Ризе, долина Фыртына, Чамлыхемшин и Айдер.', 'Ayder Plateau'], ['Тур Узунгёль', 'Чайная фабрика, смотровая площадка и виды Чёрного моря.', 'Uzungol Lake'], ['Городской тур', 'История, побережье и местные вкусы Трабзона.', 'Trabzon city']],
  ar: [['جولة سومেলা', 'دير سومела وجبل زيغانا وكهف كاراجا وهامسي كوي.', 'Sumela Monastery'], ['جولة باتومي', 'غونيو وبياتزا وساحة أوروبا وتمثال علي ونينو.', 'Batumi'], ['هضبة آيدر', 'ريزه ووادي فرتينا وتشامليهمشين وآيدر.', 'Ayder Plateau'], ['جولة أوزونغول', 'مصنع الشاي ومنصة المشاهدة ومناظر البحر الأسود.', 'Uzungol Lake'], ['جولة المدينة', 'تاريخ طرابزون وساحلها ونكهاتها المحلية.', 'Trabzon city']]
};
const tourImages = { 'Sumela Monastery': 'https://dtfm70u91tln3.cloudfront.net/309/1728312465.jpg', Batumi: 'https://cdng.jollytur.com/files/packagephoto/packagephotos/f7873d29-5090-4fcb-9764-60a067a229b7-600.png', 'Ayder Plateau': 'https://ayalatour.com.tr/image/cache/catalog/turlar/ayder/rize-cikisli-ayder-yaylasi-turu-1%20(10)-854x480w.jpg', 'Uzungol Lake': 'https://jovaturizm.com/wp-content/uploads/2023/08/trabzonun-caykara-ilcesine-bagli-dogal-guzellikler-1623564013607.jpg', 'Trabzon city': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSY_5MxCz9LJA8Yab01-TnFzI-Xc1Y0TQkuRx75NhG9gYVJaq3BJT4wAPok&s=10' };
tourContent.fa = [['تور صومعه سوملا', 'صومعه سوملا، کوه زیگانا، غار کاراجا و هامسی‌کوی.', 'Sumela Monastery'], ['تور باتومی', 'گونی‌او، پیاتزا، میدان اروپا و علی و نینو.', 'Batumi'], ['فلات آیدر', 'ریزه، دره فیرتینا، چاملی‌همشین و آیدر.', 'Ayder Plateau'], ['تور اوزون‌گول', 'کارخانه چای، سکوی تماشا و چشم‌انداز دریای سیاه.', 'Uzungol Lake'], ['تور شهری', 'تاریخ، ساحل و طعم‌های محلی ترابزون.', 'Trabzon city']];
tourImages['Sümela Monastery'] = tourImages['Sumela Monastery'];
const trabzonGuide = {
  tr: { title: 'Trabzon Rehberi', intro: 'Karadeniz’in tarihini, doğasını ve lezzetlerini keşfedin.', places: [
    ['Trabzon Ayasofya Müzesi', 'Bizans döneminden kalan etkileyici freskleri ve deniz manzarasıyla şehrin simge yapılarından.', 'Hagia Sophia Trabzon', 'Tarih · Merkez'],
    ['Atatürk Köşkü', 'Çam ağaçları arasındaki köşk, bahçesi ve şehir manzarasıyla sakin bir gezi noktasıdır.', 'Ataturk Mansion Trabzon', 'Kültür · Soğuksu'],
    ['Boztepe Seyir Terası', 'Trabzon ve Karadeniz’i yüksekten izleyebileceğiniz gün batımı rotası.', 'Boztepe Trabzon', 'Manzara · Merkez'],
    ['Uzungöl', 'Göl çevresindeki yürüyüş yolları, yayla havası ve fotoğraf noktalarıyla doğa kaçamağı.', 'Uzungol Lake', 'Doğa · Çaykara'],
    ['Sümela Manastırı', 'Maçka vadisine hakim kayalıkta yer alan tarihi manastır ve milli park rotası.', 'Sumela Monastery', 'Tarih · Maçka'],
    ['Çal Mağarası', 'Yer altı deresi ve yürüyüş parkuruyla keşfedilecek doğal oluşum.', 'Cal Cave Trabzon', 'Doğa · Düzköy'],
    ['Trabzon Meydan Parkı', 'Kafeler, alışveriş ve şehir atmosferi için merkezi buluşma noktası.', 'Trabzon Square', 'Şehir · Merkez'],
    ['Akçaabat Sahili', 'Sahil yürüyüşü ve yöresel köfte molası için ideal bir Karadeniz durağı.', 'Akcaabat Coast', 'Lezzet · Akçaabat']
  ] },
  en: { title: 'Trabzon Guide', intro: 'Discover the Black Sea coast through history, nature and local flavours.', places: [
    ['Trabzon Hagia Sophia Museum', 'A landmark with Byzantine frescoes and views towards the sea.', 'Hagia Sophia Trabzon', 'History · Centre'],
    ['Atatürk Mansion', 'A peaceful mansion surrounded by pine trees with beautiful city views.', 'Ataturk Mansion Trabzon', 'Culture · Soğuksu'],
    ['Boztepe Viewpoint', 'A panoramic Trabzon and Black Sea view, especially beautiful at sunset.', 'Boztepe Trabzon', 'View · Centre'],
    ['Uzungol', 'Walking paths, highland air and photo spots around a famous mountain lake.', 'Uzungol Lake', 'Nature · Caykara'],
    ['Sumela Monastery', 'A historic monastery on a cliff above the Maçka valley.', 'Sumela Monastery', 'History · Macka'],
    ['Cal Cave', 'A natural cave route shaped by an underground stream.', 'Cal Cave Trabzon', 'Nature · Duzkoy'],
    ['Trabzon Square Park', 'The central meeting point for cafés, shopping and city life.', 'Trabzon Square', 'City · Centre'],
    ['Akcaabat Coast', 'A seaside walk paired with the district’s famous local meatballs.', 'Akcaabat Coast', 'Food · Akcaabat']
  ] },
  de: { title: 'Trabzon-Reiseführer', intro: 'Entdecken Sie Geschichte, Natur und lokale Spezialitäten am Schwarzen Meer.', places: [
    ['Hagia-Sophia-Museum Trabzon', 'Ein Wahrzeichen mit byzantinischen Fresken und Blick aufs Meer.', 'Hagia Sophia Trabzon', 'Geschichte · Zentrum'],
    ['Atatürk-Villa', 'Eine ruhige Villa inmitten von Pinien mit schöner Stadtaussicht.', 'Ataturk Mansion Trabzon', 'Kultur · Soğuksu'],
    ['Boztepe-Aussichtspunkt', 'Ein Panoramablick auf Trabzon und das Schwarze Meer, besonders schön bei Sonnenuntergang.', 'Boztepe Trabzon', 'Aussicht · Zentrum'],
    ['Uzungöl', 'Wanderwege, Hochlandluft und Fotospots rund um einen berühmten Bergsee.', 'Uzungol Lake', 'Natur · Çaykara'],
    ['Sümela-Kloster', 'Ein historisches Kloster auf einem Felsen über dem Maçka-Tal.', 'Sumela Monastery', 'Geschichte · Maçka'],
    ['Çal-Höhle', 'Eine Naturhöhle, geformt von einem unterirdischen Bach.', 'Cal Cave Trabzon', 'Natur · Düzköy'],
    ['Trabzon Meydan Park', 'Der zentrale Treffpunkt für Cafés, Einkaufen und Stadtleben.', 'Trabzon Square', 'Stadt · Zentrum'],
    ['Akçaabat-Küste', 'Ein Spaziergang am Meer, kombiniert mit den berühmten lokalen Köfte.', 'Akcaabat Coast', 'Genuss · Akçaabat']
  ] },
  ru: { title: 'Путеводитель по Трабзону', intro: 'Откройте для себя историю, природу и вкусы Чёрного моря.', places: [
    ['Музей Айя-София в Трабзоне', 'Памятник византийской эпохи с фресками и видом на море.', 'Hagia Sophia Trabzon', 'История · Центр'],
    ['Особняк Ататюрка', 'Тихий особняк среди сосен с прекрасным видом на город.', 'Ataturk Mansion Trabzon', 'Культура · Согуксу'],
    ['Смотровая площадка Боздепе', 'Панорамный вид на Трабзон и Чёрное море, особенно красив на закате.', 'Boztepe Trabzon', 'Вид · Центр'],
    ['Узунгёль', 'Пешеходные тропы, горный воздух и живописные места у знаменитого горного озера.', 'Uzungol Lake', 'Природа · Чайкара'],
    ['Монастырь Сумела', 'Исторический монастырь на скале над долиной Мачка.', 'Sumela Monastery', 'История · Мачка'],
    ['Пещера Чал', 'Природная пещера, образованная подземным ручьём.', 'Cal Cave Trabzon', 'Природа · Дюзкёй'],
    ['Парк Мейдан в Трабзоне', 'Центральное место встреч с кафе, магазинами и городской жизнью.', 'Trabzon Square', 'Город · Центр'],
    ['Побережье Акчаабат', 'Прогулка у моря в сочетании со знаменитыми местными котлетами кёфте.', 'Akcaabat Coast', 'Еда · Акчаабат']
  ] },
  ar: { title: 'دليل طرابزون', intro: 'اكتشف تاريخ البحر الأسود وطبيعته ونكهاته المحلية.', places: [
    ['متحف آيا صوفيا طرابزون', 'معلم بارز يضم جداريات بيزنطية وإطلالة على البحر.', 'Hagia Sophia Trabzon', 'تاريخ · المركز'],
    ['قصر أتاتورك', 'قصر هادئ تحيط به أشجار الصنوبر مع إطلالة جميلة على المدينة.', 'Ataturk Mansion Trabzon', 'ثقافة · صوغوقصو'],
    ['نقطة مشاهدة بوزتبه', 'إطلالة بانورامية على طرابزون والبحر الأسود، تكون رائعة خاصة عند الغروب.', 'Boztepe Trabzon', 'إطلالة · المركز'],
    ['أوزنغول', 'مسارات للمشي وأجواء المرتفعات ومواقع تصوير حول بحيرة جبلية شهيرة.', 'Uzungol Lake', 'طبيعة · چايكارا'],
    ['دير سوميلا', 'دير تاريخي على منحدر صخري يطل على وادي ماتشكا.', 'Sumela Monastery', 'تاريخ · ماتشكا'],
    ['مغارة چال', 'كهف طبيعي تشكّل بفعل جدول مائي جوفي.', 'Cal Cave Trabzon', 'طبيعة · دوزكوي'],
    ['حديقة ميدان طرابزون', 'نقطة التقاء مركزية للمقاهي والتسوق وحياة المدينة.', 'Trabzon Square', 'مدينة · المركز'],
    ['ساحل آقچاآبات', 'نزهة على الساحل مع كرات اللحم المحلية الشهيرة.', 'Akcaabat Coast', 'مذاق · آقچاآبات']
  ] },
  fa: { title: 'راهنمای ترابزون', intro: 'تاریخ، طبیعت و طعم‌های محلی دریای سیاه را کشف کنید.', places: [
    ['موزه ایاصوفیه ترابزون', 'بنایی شاخص با نقاشی‌های دیواری بیزانسی و چشم‌انداز دریا.', 'Hagia Sophia Trabzon', 'تاریخ · مرکز'],
    ['کوشک آتاتورک', 'کوشکی آرام در میان درختان کاج با چشم‌اندازی زیبا از شهر.', 'Ataturk Mansion Trabzon', 'فرهنگ · سوغوکسو'],
    ['نقطه دید بوزتپه', 'چشم‌اندازی پانوراما از ترابزون و دریای سیاه، به‌ویژه هنگام غروب آفتاب.', 'Boztepe Trabzon', 'چشم‌انداز · مرکز'],
    ['اوزونگل', 'مسیرهای پیاده‌روی، هوای ییلاقی و نقاط عکاسی در اطراف دریاچه‌ای کوهستانی مشهور.', 'Uzungol Lake', 'طبیعت · چایکارا'],
    ['صومعه سومهلا', 'صومعه‌ای تاریخی بر صخره‌ای مشرف به دره ماچکا.', 'Sumela Monastery', 'تاریخ · ماچکا'],
    ['غار چال', 'غاری طبیعی که توسط رودخانه‌ای زیرزمینی شکل گرفته است.', 'Cal Cave Trabzon', 'طبیعت · دوزکوی'],
    ['پارک میدان ترابزون', 'نقطه مرکزی برای کافه‌ها، خرید و زندگی شهری.', 'Trabzon Square', 'شهر · مرکز'],
    ['ساحل آکچاآبات', 'قدم زدن در ساحل همراه با کوفته‌های محلی معروف.', 'Akcaabat Coast', 'طعم · آکچاآبات']
  ] }
};
['de', 'ru', 'ar', 'fa'].forEach(language => { trabzonGuide[language].places = [...trabzonGuide.en.places]; });
const newGuidePlaces = {
  tr: [
    ['Ganita Sahili', 'Şehir merkezine yakın yürüyüş yolu, deniz manzarası ve gün batımı için keyifli bir sahil rotası.', 'Ganita Coast', 'Sahil · Merkez'],
    ['Sera Gölü', 'Doğa yürüyüşü, göl manzarası ve sakin bir piknik molası için ideal tabiat parkı.', 'Sera Lake', 'Doğa · Akçaabat'],
    ['Yalıncak Sahili', 'Plajı, yürüyüş alanları ve deniz kenarında dinlenme noktalarıyla modern bir sahil bölgesi.', 'Yalincak Coast', 'Sahil · Ortahisar']
  ],
  en: [
    ['Ganita Coast', 'A pleasant waterfront route near the city centre for walks, sea views and sunset.', 'Ganita Coast', 'Coast · Centre'],
    ['Sera Lake', 'A peaceful nature park for walking, lake views and a relaxed picnic break.', 'Sera Lake', 'Nature · Akcaabat'],
    ['Yalincak Coast', 'A modern seaside area with a beach, walking spaces and places to relax by the water.', 'Yalincak Coast', 'Coast · Ortahisar']
  ],
  de: [
    ['Ganita-Küste', 'Eine schöne Uferpromenade nahe dem Zentrum für Spaziergänge, Meerblick und Sonnenuntergänge.', 'Ganita Coast', 'Küste · Zentrum'],
    ['Sera-See', 'Ein ruhiger Naturpark für Spaziergänge, Seeblick und eine entspannte Picknickpause.', 'Sera Lake', 'Natur · Akçaabat'],
    ['Yalıncak-Küste', 'Ein modernes Küstengebiet mit Strand, Spazierwegen und Erholungsplätzen am Wasser.', 'Yalincak Coast', 'Küste · Ortahisar']
  ],
  ru: [
    ['Побережье Ганита', 'Приятная набережная недалеко от центра для прогулок, морских видов и заката.', 'Ganita Coast', 'Побережье · Центр'],
    ['Озеро Сера', 'Тихий природный парк для прогулок, вида на озеро и спокойного пикника.', 'Sera Lake', 'Природа · Акчаабат'],
    ['Побережье Ялынджак', 'Современная зона отдыха с пляжем, дорожками для прогулок и местами у моря.', 'Yalincak Coast', 'Побережье · Ортахисар']
  ],
  ar: [
    ['ساحل غانيتا', 'ممشى جميل قرب وسط المدينة للمشي والاستمتاع بإطلالة البحر والغروب.', 'Ganita Coast', 'شاطئ · المركز'],
    ['بحيرة سيرا', 'حديقة طبيعية هادئة للمشي وإطلالة البحيرة والاستراحة في نزهة قصيرة.', 'Sera Lake', 'طبيعة · أكشابات'],
    ['ساحل يالينجاك', 'منطقة ساحلية عصرية تضم شاطئاً ومسارات للمشي وأماكن للاسترخاء.', 'Yalincak Coast', 'شاطئ · أورتاحصار']
  ],
  fa: [
    ['ساحل گانیتا', 'مسیر ساحلی دلنشین نزدیک مرکز شهر برای پیاده‌روی، تماشای دریا و غروب.', 'Ganita Coast', 'ساحل · مرکز'],
    ['دریاچه سرا', 'پارک طبیعی آرام برای پیاده‌روی، تماشای دریاچه و استراحت در پیک‌نیک.', 'Sera Lake', 'طبیعت · آکچاآباد'],
    ['ساحل یالینجاک', 'منطقه‌ای مدرن با ساحل، مسیر پیاده‌روی و فضاهای استراحت کنار دریا.', 'Yalincak Coast', 'ساحل · اورتاحیصار']
  ]
};
Object.keys(newGuidePlaces).forEach(language => { trabzonGuide[language].places.push(...newGuidePlaces[language]); });
const guideImages = {
  'Hagia Sophia Trabzon': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSHECCCbQ-gy2cLm_npN9_pdwGjWE9VnUv6UVopQ-dMIw&s=10',
  'Ataturk Mansion Trabzon': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT40-_1gTEudv0E8JBqEAYwVYw6hFdDOG1v0yJ_YZTw3T26Yt3GseszODHp&s=10',
  'Boztepe Trabzon': 'https://resim.haber61.net/news/323284.jpg',
  'Uzungol Lake': tourImages['Uzungol Lake'],
  'Sumela Monastery': tourImages['Sumela Monastery'],
  'Cal Cave Trabzon': 'https://www.trabzon.bel.tr/img/SehriKesfet/Magaralar/cal-magarasi-a.jpg',
  'Trabzon Square': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQM1OsL7esvUvKuVbw2bpo8jkpydqrQEWNzqfiGd2f8scPidRFXjV6un1lZ&s=10',
  'Akcaabat Coast': 'https://www.akcaabat.bel.tr/uploads/HABERLER/683.jpg',
  'Ganita Coast': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSh48uRXVZmjGquzND3fzsAQpxpFVq-Qx88Fjj0xDfSnxpdY9yaGu3g-m1r&s=10',
  'Sera Lake': 'https://www.homywood.com.tr/wp-content/uploads/2026/03/sera-golu-tabiat-parki-2.jpg',
  'Yalincak Coast': 'https://static.daktilo.com/sites/1262/uploads/2023/06/13/trapark-uygulamasi-bu-kez-o-plajda-basladi-1686636773.jpg'
};
const uiIcons = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
  cafe: '<path d="M5 8h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5ZM16 10h2a2 2 0 0 1 0 4h-2M3 21h16"/>',
  chat: '<path d="M4 5h16v11H8l-4 4Z"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18a2 2 0 0 0 3 3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.2 2.2-2.7-2.7Z"/>',
  taxi: '<path d="m5 17 1.4-6h11.2l1.4 6M7 11l1.5-3h7l1.5 3M4 17h16M7 19h.01M17 19h.01"/><path d="M8 14h.01M16 14h.01"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  spark: '<path d="m12 3 1.2 4.8L18 9l-4.8 1.2L12 15l-1.2-4.8L6 9l4.8-1.2ZM19 16l.6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6Z"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.2 2.4 3.5 5.4 3.5 9s-1.3 6.6-3.5 9c-2.2-2.4-3.5-5.4-3.5-9S9.8 5.4 12 3Z"/>',
  bed: '<path d="M3 18v-8a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v1h3a4 4 0 0 1 4 4v3M3 15h16M5 18v2M19 18v2"/>',
  wifi: '<path d="M5 12.5a11 11 0 0 1 14 0M8 15.5a6 6 0 0 1 8 0M11 18.5a2 2 0 0 1 2 0"/><circle cx="12" cy="21" r=".8" fill="currentColor" stroke="none"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  moon: '<path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.6 8.6 0 1 0 20.5 15.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>'
};
function icon(name, className = '') { return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${uiIcons[name] || ''}</svg>`; }
const themeToggleCopy = {
  tr: { dark: 'Koyu temayı aç', light: 'Açık temayı aç' },
  en: { dark: 'Switch to dark theme', light: 'Switch to light theme' },
  de: { dark: 'Dunkles Design aktivieren', light: 'Helles Design aktivieren' },
  ru: { dark: 'Включить тёмную тему', light: 'Включить светлую тему' },
  ar: { dark: 'تفعيل المظهر الداكن', light: 'تفعيل المظهر الفاتح' },
  fa: { dark: 'فعال‌کردن پوسته تیره', light: 'فعال‌کردن پوسته روشن' }
};
const taxiTranslations = {
  tr: { label: 'Taksi iste', eyebrow: 'Taksi hizmeti', confirm: 'Odanız için taksi talebi oluşturalım mı?', help: 'Talep resepsiyona iletilecek ve 30 dakika sonra sistemden otomatik silinecek.', create: 'Talep oluştur', cancel: 'Vazgeç', active: 'Taksi talebiniz aktif.', expires: '30 dakika içinde otomatik silinir.', cancelRequest: 'Talebi iptal et', failedTitle: 'Taksi talebi gönderilemedi', failedText: 'Lütfen resepsiyonla iletişime geçin.', close: 'Kapat' },
  en: { label: 'Request taxi', eyebrow: 'Taxi service', confirm: 'Would you like to request a taxi for your room?', help: 'Reception will receive the request. It will be removed automatically after 30 minutes.', create: 'Request taxi', cancel: 'Cancel', active: 'Your taxi request is active.', expires: 'It will be removed automatically within 30 minutes.', cancelRequest: 'Cancel request', failedTitle: 'Taxi request could not be sent', failedText: 'Please contact reception.', close: 'Close' },
  de: { label: 'Taxi anfordern', eyebrow: 'Taxiservice', confirm: 'Möchten Sie ein Taxi für Ihr Zimmer anfordern?', help: 'Die Rezeption erhält die Anfrage. Sie wird nach 30 Minuten automatisch gelöscht.', create: 'Taxi anfordern', cancel: 'Abbrechen', active: 'Ihre Taxianfrage ist aktiv.', expires: 'Sie wird innerhalb von 30 Minuten automatisch gelöscht.', cancelRequest: 'Anfrage stornieren', failedTitle: 'Taxianfrage konnte nicht gesendet werden', failedText: 'Bitte wenden Sie sich an die Rezeption.', close: 'Schließen' },
  ru: { label: 'Заказать такси', eyebrow: 'Такси', confirm: 'Заказать такси для вашего номера?', help: 'Ресепшен получит запрос. Он будет автоматически удалён через 30 минут.', create: 'Заказать', cancel: 'Отмена', active: 'Ваш запрос на такси активен.', expires: 'Он будет автоматически удалён через 30 минут.', cancelRequest: 'Отменить запрос', failedTitle: 'Не удалось заказать такси', failedText: 'Обратитесь на ресепшен.', close: 'Закрыть' },
  ar: { label: 'طلب سيارة أجرة', eyebrow: 'خدمة سيارات الأجرة', confirm: 'هل تريد طلب سيارة أجرة لغرفتك؟', help: 'سيصل الطلب إلى الاستقبال وسيُحذف تلقائياً بعد 30 دقيقة.', create: 'طلب السيارة', cancel: 'إلغاء', active: 'طلب سيارة الأجرة نشط.', expires: 'سيُحذف تلقائياً خلال 30 دقيقة.', cancelRequest: 'إلغاء الطلب', failedTitle: 'تعذر إرسال طلب السيارة', failedText: 'يرجى التواصل مع الاستقبال.', close: 'إغلاق' }
};
taxiTranslations.fa = { label: 'درخواست تاکسی', eyebrow: 'خدمات تاکسی', confirm: 'آیا برای اتاق خود تاکسی درخواست می‌کنید؟', help: 'درخواست به پذیرش ارسال می‌شود و پس از ۳۰ دقیقه به‌صورت خودکار حذف خواهد شد.', create: 'ایجاد درخواست', cancel: 'لغو', active: 'درخواست تاکسی شما فعال است.', expires: 'این درخواست تا ۳۰ دقیقه دیگر خودکار حذف می‌شود.', cancelRequest: 'لغو درخواست', failedTitle: 'درخواست تاکسی ارسال نشد', failedText: 'لطفاً با پذیرش تماس بگیرید.', close: 'بستن' };
function taxiText(key) { return (taxiTranslations[state.language] || taxiTranslations.tr)[key]; }
const taxiPageCopy = {
  tr: { title: 'Taksi talebi', intro: 'Yolculuk bilgilerinizi seçin; talebiniz resepsiyona iletilsin.', passengers: 'Yolcu sayısı', destination: 'Varış adresi (isteğe bağlı)', destinationPlaceholder: 'Trabzon içinde adres arayın', destinationHelp: 'Adres önerileri OpenStreetMap verilerinden sağlanır.', pickup: 'Alınış noktası', hotel: 'Cityport Hotel', myLocation: 'Mevcut konumum', locate: 'Konumumu kullan', locating: 'Konum alınıyor…', locationDenied: 'Konum alınamadı. İzin verin veya Cityport Hotel’i seçin.', locationOutside: 'Seçilen konum Trabzon sınırları dışında.', payment: 'Ödeme yöntemi', cash: 'Nakit', card: 'Kredi kartı', submit: 'Taksi çağır', submitting: 'Talebiniz gönderiliyor…', cancel: 'Talebi iptal et', status: 'Taksi durumu', pending: 'Taksi talebiniz alındı.', called: 'Taksi çağrıldı', ready: 'Taksiniz hazır', cancelled: 'Taksi talebi iptal edildi', error: 'Taksi talebi gönderilemedi. Lütfen tekrar deneyin veya resepsiyonla iletişime geçin.', savedNotNotified: 'Taksi talebiniz kaydedildi ancak resepsiyona bildirilemedi. Lütfen tekrar göndermeyin ve resepsiyonla iletişime geçin.', noResults: 'Trabzon içinde eşleşen adres bulunamadı.', searchError: 'Adres önerileri yüklenemedi. Lütfen tekrar deneyin.', searching: 'Adres aranıyor…', expires: 'Talep 30 dakika içinde otomatik olarak kapanır.', outside: 'Trabzon içinden bir konum seçin.' },
  en: { title: 'Taxi request', intro: 'Choose your trip details and send the request to reception.', passengers: 'Passengers', destination: 'Destination (optional)', destinationPlaceholder: 'Search for an address in Trabzon', destinationHelp: 'Address suggestions use OpenStreetMap data.', pickup: 'Pickup location', hotel: 'Cityport Hotel', myLocation: 'My current location', locate: 'Use my location', locating: 'Getting your location…', locationDenied: 'Could not get your location. Allow access or choose Cityport Hotel.', locationOutside: 'The selected location is outside Trabzon.', payment: 'Payment method', cash: 'Cash', card: 'Credit card', submit: 'Request taxi', submitting: 'Sending your request…', cancel: 'Cancel request', status: 'Taxi status', pending: 'Your taxi request was received.', called: 'Taxi called', ready: 'Your taxi is ready', cancelled: 'Taxi request cancelled', error: 'Taxi request failed. Try again or contact reception.', savedNotNotified: 'Your taxi request was saved, but reception could not be notified. Do not submit it again; contact reception.', noResults: 'No matching address found in Trabzon.', searchError: 'Address suggestions could not be loaded. Please try again.', searching: 'Searching addresses…', expires: 'The request closes automatically in 30 minutes.', outside: 'Choose a location within Trabzon.' },
  de: { title: 'Taxianfrage', intro: 'Wählen Sie Ihre Fahrtdetails und senden Sie die Anfrage an die Rezeption.', passengers: 'Fahrgäste', destination: 'Zieladresse (optional)', destinationPlaceholder: 'Adresse in Trabzon suchen', destinationHelp: 'Adressvorschläge stammen aus OpenStreetMap.', pickup: 'Abholort', hotel: 'Cityport Hotel', myLocation: 'Mein aktueller Standort', locate: 'Meinen Standort verwenden', locating: 'Standort wird ermittelt…', locationDenied: 'Standort nicht verfügbar. Erlauben Sie den Zugriff oder wählen Sie Cityport Hotel.', locationOutside: 'Der Standort liegt außerhalb von Trabzon.', payment: 'Zahlungsmethode', cash: 'Bar', card: 'Kreditkarte', submit: 'Taxi anfordern', submitting: 'Anfrage wird gesendet…', cancel: 'Anfrage stornieren', status: 'Taxistatus', pending: 'Ihre Taxianfrage ist eingegangen.', called: 'Taxi wurde gerufen', ready: 'Ihr Taxi ist bereit', cancelled: 'Taxianfrage storniert', error: 'Taxianfrage fehlgeschlagen. Versuchen Sie es erneut oder kontaktieren Sie die Rezeption.', savedNotNotified: 'Ihre Taxianfrage wurde gespeichert, aber die Rezeption nicht benachrichtigt. Bitte nicht erneut senden; wenden Sie sich an die Rezeption.', noResults: 'Keine passende Adresse in Trabzon gefunden.', searchError: 'Adressvorschläge konnten nicht geladen werden.', searching: 'Adressen werden gesucht…', expires: 'Die Anfrage wird nach 30 Minuten automatisch geschlossen.', outside: 'Wählen Sie einen Standort in Trabzon.' },
  ru: { title: 'Заказ такси', intro: 'Укажите детали поездки и отправьте запрос на ресепшен.', passengers: 'Пассажиры', destination: 'Адрес назначения (необязательно)', destinationPlaceholder: 'Введите адрес в Трабзоне', destinationHelp: 'Подсказки используют данные OpenStreetMap.', pickup: 'Место подачи', hotel: 'Cityport Hotel', myLocation: 'Моё местоположение', locate: 'Использовать моё местоположение', locating: 'Определяем местоположение…', locationDenied: 'Не удалось определить местоположение. Разрешите доступ или выберите Cityport Hotel.', locationOutside: 'Это место находится за пределами Трабзона.', payment: 'Способ оплаты', cash: 'Наличные', card: 'Банковская карта', submit: 'Заказать такси', submitting: 'Отправляем запрос…', cancel: 'Отменить запрос', status: 'Статус такси', pending: 'Запрос такси принят.', called: 'Такси вызвано', ready: 'Такси готово', cancelled: 'Запрос такси отменён', error: 'Не удалось заказать такси. Попробуйте ещё раз или свяжитесь с ресепшеном.', savedNotNotified: 'Запрос сохранён, но ресепшен не получил уведомление. Не отправляйте его повторно, свяжитесь с ресепшеном.', noResults: 'Подходящий адрес в Трабзоне не найден.', searchError: 'Не удалось загрузить подсказки адресов.', searching: 'Ищем адреса…', expires: 'Запрос автоматически закроется через 30 минут.', outside: 'Выберите место в пределах Трабзона.' },
  ar: { title: 'طلب سيارة أجرة', intro: 'اختر تفاصيل الرحلة وأرسل الطلب إلى الاستقبال.', passengers: 'عدد الركاب', destination: 'عنوان الوصول (اختياري)', destinationPlaceholder: 'ابحث عن عنوان في طرابزون', destinationHelp: 'تُستخدم بيانات OpenStreetMap لاقتراح العناوين.', pickup: 'موقع الالتقاء', hotel: 'فندق سيتيبورت', myLocation: 'موقعي الحالي', locate: 'استخدم موقعي', locating: 'جارٍ تحديد موقعك…', locationDenied: 'تعذر تحديد موقعك. اسمح بالوصول أو اختر الفندق.', locationOutside: 'الموقع المحدد خارج طرابزون.', payment: 'طريقة الدفع', cash: 'نقداً', card: 'بطاقة ائتمان', submit: 'اطلب سيارة', submitting: 'جارٍ إرسال الطلب…', cancel: 'إلغاء الطلب', status: 'حالة سيارة الأجرة', pending: 'تم استلام طلبك.', called: 'تم استدعاء السيارة', ready: 'السيارة جاهزة', cancelled: 'تم إلغاء الطلب', error: 'تعذر إرسال الطلب. حاول مجدداً أو اتصل بالاستقبال.', savedNotNotified: 'تم حفظ طلبك لكن تعذر إخطار الاستقبال. لا ترسله مرة أخرى واتصل بالاستقبال.', noResults: 'لم يتم العثور على عنوان مناسب في طرابزون.', searchError: 'تعذر تحميل اقتراحات العناوين.', searching: 'جارٍ البحث عن العناوين…', expires: 'سيُغلق الطلب تلقائياً بعد 30 دقيقة.', outside: 'اختر موقعاً داخل طرابزون.' },
  fa: { title: 'درخواست تاکسی', intro: 'جزئیات سفر را انتخاب کنید تا درخواست به پذیرش ارسال شود.', passengers: 'تعداد مسافران', destination: 'آدرس مقصد (اختیاری)', destinationPlaceholder: 'جستجوی نشانی در ترابزون', destinationHelp: 'پیشنهاد نشانی‌ها از داده‌های OpenStreetMap است.', pickup: 'محل سوارشدن', hotel: 'هتل سیتی‌پورت', myLocation: 'موقعیت فعلی من', locate: 'استفاده از موقعیت من', locating: 'در حال دریافت موقعیت…', locationDenied: 'موقعیت دریافت نشد. اجازه دهید یا هتل را انتخاب کنید.', locationOutside: 'موقعیت انتخاب‌شده خارج از ترابزون است.', payment: 'روش پرداخت', cash: 'نقدی', card: 'کارت اعتباری', submit: 'درخواست تاکسی', submitting: 'در حال ارسال درخواست…', cancel: 'لغو درخواست', status: 'وضعیت تاکسی', pending: 'درخواست تاکسی شما دریافت شد.', called: 'تاکسی فراخوانده شد', ready: 'تاکسی آماده است', cancelled: 'درخواست تاکسی لغو شد', error: 'ارسال درخواست ناموفق بود. دوباره تلاش کنید یا با پذیرش تماس بگیرید.', savedNotNotified: 'درخواست ذخیره شد اما پذیرش مطلع نشد. دوباره ارسال نکنید و با پذیرش تماس بگیرید.', noResults: 'نشانی مناسبی در ترابزون پیدا نشد.', searchError: 'دریافت پیشنهادهای نشانی ناموفق بود.', searching: 'در حال جستجوی نشانی…', expires: 'درخواست پس از ۳۰ دقیقه خودکار بسته می‌شود.', outside: 'مکانی در محدوده ترابزون انتخاب کنید.' }
};
function taxiPageText(key) { return (taxiPageCopy[state.language] || taxiPageCopy.tr)[key]; }
function taxiStatusText(status) {
  if (status === 'called') return taxiPageText('called');
  if (status === 'ready') return taxiPageText('ready');
  if (status === 'cancelled') return taxiPageText('cancelled');
  return taxiPageText('pending');
}
const taxiLocationHelpCopy = {
  tr: 'Konumumu kullan’a dokunun ve tarayıcı izin istediğinde “İzin ver”i seçin. Daha önce engellediyseniz adres çubuğundaki site ayarlarından Konum iznini açıp sayfayı yenileyin.',
  en: 'Tap “Use my location” and select “Allow” when your browser asks. If access was blocked before, enable Location in this site’s address-bar settings and reload the page.',
  de: 'Tippen Sie auf „Meinen Standort verwenden“ und wählen Sie „Zulassen“, wenn der Browser fragt. Falls der Zugriff zuvor blockiert wurde, aktivieren Sie den Standort in den Website-Einstellungen neben der Adressleiste und laden Sie die Seite neu.',
  ru: 'Нажмите «Использовать моё местоположение» и выберите «Разрешить» в запросе браузера. Если доступ уже запрещён, разрешите местоположение в настройках сайта рядом с адресной строкой и перезагрузите страницу.',
  ar: 'اضغط على «استخدم موقعي» واختر «السماح» عندما يطلب المتصفح ذلك. إذا سبق أن حظرت الوصول، فعّل الموقع من إعدادات هذا الموقع بجانب شريط العنوان ثم أعد تحميل الصفحة.',
  fa: 'روی «استفاده از موقعیت من» بزنید و هنگام درخواست مرورگر «اجازه» را انتخاب کنید. اگر قبلاً دسترسی را مسدود کرده‌اید، مکان را در تنظیمات این سایت کنار نوار نشانی مجاز کنید و صفحه را دوباره بارگیری کنید.'
};
const taxiLocationErrorCopy = {
  tr: { denied: 'Konum izni kapalı. Adres çubuğundaki site ayarlarından Konum’u İzin ver yapıp sayfayı yenileyin.', unavailable: 'Konum belirlenemedi. Cihazınızın konum servislerini açıp tekrar deneyin.' },
  en: { denied: 'Location access is blocked. Enable Location in this site’s address-bar settings and reload the page.', unavailable: 'Your location could not be determined. Turn on your device location services and try again.' },
  de: { denied: 'Standortzugriff ist blockiert. Aktivieren Sie den Standort in den Website-Einstellungen neben der Adressleiste und laden Sie die Seite neu.', unavailable: 'Ihr Standort konnte nicht ermittelt werden. Aktivieren Sie die Standortdienste Ihres Geräts und versuchen Sie es erneut.' },
  ru: { denied: 'Доступ к местоположению запрещён. Разрешите его в настройках сайта рядом с адресной строкой и перезагрузите страницу.', unavailable: 'Не удалось определить местоположение. Включите службы геолокации устройства и попробуйте снова.' },
  ar: { denied: 'الوصول إلى الموقع محظور. فعّله من إعدادات هذا الموقع بجانب شريط العنوان ثم أعد تحميل الصفحة.', unavailable: 'تعذر تحديد موقعك. فعّل خدمات الموقع في جهازك وحاول مجدداً.' },
  fa: { denied: 'دسترسی به مکان مسدود است. مکان را در تنظیمات این سایت کنار نوار نشانی مجاز کنید و صفحه را دوباره بارگیری کنید.', unavailable: 'موقعیت شما پیدا نشد. سرویس مکان‌یابی دستگاه را روشن کنید و دوباره تلاش کنید.' }
};
function taxiLocationText(copy) {
  return (taxiLocationErrorCopy[state.language] || taxiLocationErrorCopy.tr)[copy];
}
const transferActionTranslations = {
  tr: { call: 'Ara', message: 'Mesaj yaz' }, en: { call: 'Call', message: 'Message' }, de: { call: 'Anrufen', message: 'Nachricht' }, ru: { call: 'Позвонить', message: 'Сообщение' }, ar: { call: 'اتصال', message: 'رسالة' }
};
transferActionTranslations.fa = { call: 'تماس', message: 'ارسال پیام' };
function transferText(key) { return (transferActionTranslations[state.language] || transferActionTranslations.tr)[key]; }
const stayDateTranslations = {
  tr: { checkin: 'Check-in', checkout: 'Check-out' }, en: { checkin: 'Check-in', checkout: 'Check-out' }, de: { checkin: 'Check-in', checkout: 'Check-out' }, ru: { checkin: 'Заезд', checkout: 'Выезд' }, ar: { checkin: 'تسجيل الوصول', checkout: 'تسجيل المغادرة' }
};
stayDateTranslations.fa = { checkin: 'ورود', checkout: 'خروج' };
function stayDateText(key) { return (stayDateTranslations[state.language] || stayDateTranslations.tr)[key]; }
function isCheckoutToday() { const value = state.guest?.checkoutDate || ''; const match = value.match(/^(\d{1,2})\s+(Oca|Şub|Mar|Nis|May|Haz|Tem|Ağu|Eyl|Eki|Kas|Ara)\s+(\d{4})$/); if (!match) return false; const months = { Oca: 0, Şub: 1, Mar: 2, Nis: 3, May: 4, Haz: 5, Tem: 6, Ağu: 7, Eyl: 8, Eki: 9, Kas: 10, Ara: 11 }; const today = new Date(); return today.getDate() === Number(match[1]) && today.getMonth() === months[match[2]] && today.getFullYear() === Number(match[3]); }

const tours = [
  ['Sümela Turu', 'Sümela Manastırı, Zigana Dağı, Karaca Mağarası, Torul Cam Teras ve Hamsiköy.'],
  ['Batum Turu', 'Gonio Kalesi, Piazza Meydanı, Avrupa Meydanı, Medea ve Ali & Nino heykelleri.'],
  ['Ayder Yaylası Turu', 'Sürmene, Rize, Fırtına Vadisi, Çamlıhemşin ve Ayder Yaylası.'],
  ['Uzungöl Turu', 'Çay fabrikası, Uzungöl, seyir terası ve Karadeniz yayla manzaraları.']
];

function greeting() { const hour = new Date().getHours(); const greetings = greetingTranslations[state.language] || greetingTranslations.tr; return greetings[hour < 12 ? 0 : hour < 18 ? 1 : hour < 22 ? 2 : 3]; }
function storedCheckoutHasPassed() {
  const value = localStorage.getItem('cityport_checkout');
  if (!value) return false;
  const match = value.match(/^(\d{1,2})\s+(Oca|Şub|Mar|Nis|May|Haz|Tem|Ağu|Eyl|Eki|Kas|Ara)\s+(\d{4})$/);
  if (!match) return false;
  const months = { Oca: 0, Şub: 1, Mar: 2, Nis: 3, May: 4, Haz: 5, Tem: 6, Ağu: 7, Eyl: 8, Eki: 9, Kas: 10, Ara: 11 };
  return Date.UTC(Number(match[3]), months[match[2]], Number(match[1]), 9, 0) < Date.now();
}
function render() {
  const app = document.querySelector('#app');
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.lang = state.language;
  const playTransition = state.pageTransition;
  state.pageTransition = false;
  const unreadCount = state.notifications.filter(item => !item.read).length;
  app.innerHTML = `<div class="shell ${playTransition ? 'page-transition' : ''}" dir="${state.language === 'ar' || state.language === 'fa' ? 'rtl' : 'ltr'}"><header class="topbar"><div class="brand"><img src="${hotel.logo}" alt="Cityport Hotel" /><div><span class="brand-name">${hotel.name}</span><small class="brand-caption">${icon('bed', 'brand-icon')} ${c('room')} ${state.room}</small></div></div><div class="topbar-actions">${state.guest ? `<button class="theme-toggle" data-theme-toggle type="button" aria-label="${themeToggleCopy[state.language]?.[state.theme === 'dark' ? 'light' : 'dark'] || themeToggleCopy.tr[state.theme === 'dark' ? 'light' : 'dark']}" title="${themeToggleCopy[state.language]?.[state.theme === 'dark' ? 'light' : 'dark'] || themeToggleCopy.tr[state.theme === 'dark' ? 'light' : 'dark']}" aria-pressed="${state.theme === 'dark'}">${icon(state.theme === 'dark' ? 'sun' : 'moon')}</button><button class="notification-button" data-notifications-open type="button" aria-label="${ft('notifications')}">${icon('bell')}${unreadCount ? `<span class="notification-count">${unreadCount > 99 ? '99+' : unreadCount}</span>` : ''}</button><button class="menu-button" data-menu-open type="button" aria-label="${menuText('open')}"><span></span><span></span><span></span></button>` : `<label class="language-control"><span>${icon('globe')}</span><select class="lang" aria-label="${t('language')}"><option value="tr" ${state.language === 'tr' ? 'selected' : ''}>TR</option><option value="en" ${state.language === 'en' ? 'selected' : ''}>EN</option><option value="de" ${state.language === 'de' ? 'selected' : ''}>DE</option><option value="ru" ${state.language === 'ru' ? 'selected' : ''}>RU</option><option value="ar" ${state.language === 'ar' ? 'selected' : ''}>AR</option><option value="fa" ${state.language === 'fa' ? 'selected' : ''}>FA</option></select></label>`}</div></header>${viewContent()}<footer class="footer"><div>${hotel.name} · Trabzon, Türkiye · ${c('room')} ${state.room}</div><div class="contact-links"><a class="contact-link website-link" href="${hotel.website}" target="_blank" rel="noreferrer">${staticText('website')}</a><a class="contact-link instagram-link" href="${hotel.instagram}" target="_blank" rel="noreferrer">${staticText('instagram')}</a><a class="contact-link whatsapp-link" href="https://wa.me/${hotel.whatsapp.replace(/\D/g, '')}" target="_blank" rel="noreferrer">${staticText('whatsapp')}</a></div></footer><nav class="app-nav" aria-label="${t('guestExperience')}"><button class="app-nav-item ${state.view === 'home' ? 'active' : ''}" data-view="home"><span>${icon('home')}</span><small>${c('home')}</small></button><button class="app-nav-item ${state.view === 'request' ? 'active' : ''}" data-view="request"><span>${icon('chat')}</span><small>${t('sendRequest')}</small></button><button class="app-nav-item ${state.view === 'issue' ? 'active' : ''}" data-view="issue"><span>${icon('tool')}</span><small>${t('reportIssue')}</small></button><button class="app-nav-item ${state.view === 'review' ? 'active' : ''}" data-view="review"><span>${icon('star')}</span><small>${t('review')}</small></button></nav>${menuMarkup()}${notificationsModal()}</div>`;
  app.querySelector('.app-nav')?.remove();
  bind();
  if (playTransition) app.querySelector('.page-transition')?.addEventListener('animationend', event => event.currentTarget.classList.remove('page-transition'), { once: true });
}
function renderLoading() {
  document.documentElement.dataset.theme = state.theme;
  document.querySelector('#app').innerHTML = `<div class="shell loading-shell" dir="${state.language === 'ar' || state.language === 'fa' ? 'rtl' : 'ltr'}"><header class="topbar"><div class="brand"><img src="${hotel.logo}" alt="${hotel.name}" /><div><span class="brand-name">${hotel.name}</span><small class="brand-caption">${icon('bed', 'brand-icon')} ${c('room')} ${state.room}</small></div></div><label class="language-control"><span>${icon('globe')}</span><select class="lang" aria-label="${t('language')}"><option value="tr">TR</option><option value="en">EN</option><option value="de">DE</option><option value="ru">RU</option><option value="ar">AR</option><option value="fa">FA</option></select></label></header><section class="panel loading-panel"><span class="loading-mark"><img src="${hotel.logo}" alt="${hotel.name}" /></span><p class="eyebrow">${hotel.name}</p><h1>${t('verifying')}</h1><p class="lead">${t('guestNameHelp')}</p></section></div>`;
  bind();
}
function renderOffline() {
  document.querySelector('#app').innerHTML = `<div class="shell offline-shell" dir="${state.language === 'ar' || state.language === 'fa' ? 'rtl' : 'ltr'}"><section class="panel offline-panel"><div class="login-hero"><img src="${hotel.logo}" alt="${hotel.name}" /></div><p class="eyebrow">${hotel.name}</p><h1>${offlineText('title')}</h1><p class="lead">${offlineText('text')}</p><div class="offline-wifi"><small>${offlineText('wifi')}</small><strong>${hotel.wifiName}</strong><span>${hotel.wifiPassword}</span></div><p class="offline-reconnect">${offlineText('reconnect')}</p></section></div>`;
}
function taxiView() {
  const activeRequest = state.taxiRequest && Number(state.taxiRequest.expiresAt) > Date.now();
  if (activeRequest) {
    const terminal = ['ready', 'cancelled'].includes(state.taxiRequest.status);
    return `<section class="taxi-page"><div class="section page-heading"><p class="eyebrow">${taxiText('label')}</p><h1>${taxiPageText('title')}</h1></div><div class="panel taxi-active"><span class="taxi-status-icon">${icon('taxi')}</span><h2>${taxiPageText('status')}</h2>${state.taxiNotice ? `<p class="notice error" role="alert">${escapeHtml(state.taxiNotice)}</p>` : ''}<p class="notice">${escapeHtml(taxiStatusText(state.taxiRequest.status))}</p><p>${taxiPageText('expires')}</p>${terminal ? '' : `<button class="btn secondary" data-taxi-cancel type="button">${taxiPageText('cancel')}</button>`}</div></section>`;
  }
  const pickup = state.taxiPickup || { type: 'hotel', label: 'Cityport Hotel', latitude: 41.006323, longitude: 39.734137 };
  const suggestions = state.taxiSuggestions.map((item, index) => `<button class="taxi-suggestion" type="button" role="option" data-taxi-suggestion="${index}">${escapeHtml(item.label)}</button>`).join('');
  return `<section class="taxi-page"><div class="section page-heading"><p class="eyebrow">${taxiText('label')}</p><h1>${taxiPageText('title')}</h1><p class="lead">${taxiPageText('intro')}</p></div><div class="panel"><form class="form taxi-form" id="taxi-form"><label>${taxiPageText('passengers')}<select name="passengers" required>${Array.from({ length: 8 }, (_, index) => `<option value="${index + 1}" ${state.taxiPassengerCount === index + 1 ? 'selected' : ''}>${index + 1}</option>`).join('')}</select></label>  <label>${taxiPageText('destination')}<input id="taxi-destination" type="search" autocomplete="off" placeholder="${taxiPageText('destinationPlaceholder')}" value="${escapeHtml(state.taxiDestination?.label || '')}" aria-autocomplete="list" aria-controls="taxi-suggestions"><span class="taxi-help">${taxiPageText('destinationHelp')}</span><span class="taxi-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a></span><span id="taxi-suggestions" class="taxi-suggestions" role="listbox">${suggestions}</span></label><fieldset class="taxi-pickup"><legend>${taxiPageText('pickup')}</legend><p class="taxi-pickup-current">${escapeHtml(pickup.label)}</p><div class="taxi-pickup-actions"><button class="btn secondary" data-taxi-hotel type="button">${taxiPageText('hotel')}</button><button class="btn secondary" data-taxi-location type="button">${taxiPageText('locate')}</button></div><p class="taxi-location-help">${(taxiLocationHelpCopy[state.language] || taxiLocationHelpCopy.tr)}</p><div class="taxi-location-status" aria-live="polite"></div></fieldset><fieldset class="payment-choice"><legend>${taxiPageText('payment')}</legend><label><input type="radio" name="taxi-payment" value="cash" ${state.taxiPaymentMethod === 'cash' ? 'checked' : ''}> ${taxiPageText('cash')}</label><label><input type="radio" name="taxi-payment" value="card" ${state.taxiPaymentMethod === 'card' ? 'checked' : ''}> ${taxiPageText('card')}</label><small>${ft('paymentNote')}</small></fieldset>${state.taxiNotice ? `<div class="notice error" role="alert">${escapeHtml(state.taxiNotice)}</div>` : ''}<button class="btn" type="submit" ${state.taxiSubmitting ? 'disabled' : ''}>${state.taxiSubmitting ? taxiPageText('submitting') : taxiPageText('submit')}</button></form></div></section>`;
}
function viewContent() {
  if (!state.room) return roomEntryView();
  if (state.needsGuestLogin) return loginView();
  if (state.validationError) return `<section class="panel"><p class="eyebrow">Cityport Hotel</p><h1>${t('accessDenied')}</h1><p class="lead">${state.validationError}</p>${state.validationDetails ? `<div class="notice error">${state.validationDetails}</div>` : ''}<div class="actions"><a class="btn" href="tel:${hotel.phone}">${t('callReception')}</a></div></section>`;
  if (state.view === 'request') return formView(t('sendRequest'), t('access'), 'request');
  if (state.view === 'issue') return formView(t('reportIssue'), t('access'), 'issue');
  if (state.view === 'cleaning') return formView(t('cleaning'), t('access'), 'cleaning');
  if (state.view === 'cafe') return cafeView();
  if (state.view === 'taxi') return taxiView();
  if (state.view === 'tours') return toursView();
  if (state.view === 'guide') return guideView();
  if (state.view === 'review') return reviewView();
  const guestName = escapeHtml(state.guest?.guestName || 'Cityport Hotel');
  const welcomeHeading = `<div class="welcome-overlay"><h1>${greeting()} ${t('welcome')}</h1><strong class="welcome-guest-name">${guestName}</strong><p class="lead">${c('night')}</p></div>`;
  const homeMarkup = homeView().replace(/<section class="hero">[\s\S]*?<\/section>/, '').replace(/<div class="welcome-overlay">[\s\S]*?<\/div>/, welcomeHeading).replace('<section class="welcome">', `<p class="welcome-kicker eyebrow">${t('guestExperience')}</p><section class="welcome">`).replace(`<div><small>${t('breakfast')}</small><strong>${hotel.breakfast}</strong></div>`, `<div class="welcome-info-item"><span class="welcome-info-icon">${icon('cafe')}</span><div class="welcome-info-copy"><small>${t('breakfast')}</small><strong>${hotel.breakfast}</strong></div></div>`).replace(`<div><small>${wifiLabel(0)}</small><strong>${hotel.wifiName}</strong><span>${hotel.wifiPassword}</span></div>`, `<div class="welcome-info-item"><span class="welcome-info-icon">${icon('wifi')}</span><div class="welcome-info-copy"><small>${wifiLabel(0)}</small><strong>${hotel.wifiName}</strong><span>${hotel.wifiPassword}</span></div></div>`).replace('<section class="section"><div class="section-heading"', `<section class="section cafe-entry"><button class="service-banner cafe-entry-button" data-view="cafe" type="button"><span class="cafe-card-image" aria-hidden="true"></span><span class="cafe-card-copy"><strong>${roomText('cafe')}</strong><small>${roomText('cafeText')}</small></span></button></section><section class="section"><div class="section-heading"`);
  return `${homeMarkup}${firstVisitInstallModal()}${accountModal()}`;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function notificationsModal() {
  if (!state.notificationsOpen) return '';
  const content = state.notificationsLoading
    ? `<div class="notification-loading"><span class="loading-mark"><img src="${hotel.logo}" alt="" /></span></div>`
    : state.notificationsError
      ? `<p class="notice error">${c('genericError')}</p>`
    : state.notifications.length
      ? state.notifications.map(item => `<article class="guest-notification ${item.read ? '' : 'unread'}"><button class="guest-notification-content" data-notification-read="${escapeHtml(item.id)}" type="button"><strong>${escapeHtml(item.title || ft('notifications'))}</strong><span>${escapeHtml(item.body || '')}</span><small>${item.createdAt ? new Date(Number(item.createdAt)).toLocaleString(state.language) : ''}</small></button><button class="notification-delete" data-notification-delete="${escapeHtml(item.id)}" type="button" aria-label="${ft('deleteNotification')}">×</button></article>`).join('')
      : `<p class="notice ${state.notificationsError ? 'error' : ''}">${state.notificationsError ? c('genericError') : ft('noNotifications')}</p>`;
  return `<div class="modal-backdrop" data-notifications-backdrop><section class="success-modal notifications-modal" role="dialog" aria-modal="true" aria-labelledby="notifications-title"><button class="modal-close" data-notifications-close type="button" aria-label="${c('close')}">×</button><p class="eyebrow">${hotel.name}</p><h2 id="notifications-title">${ft('notifications')}</h2><div class="guest-notification-list">${content}</div></section></div>`;
}
function roomEntryView() {
  return `<section class="panel login-panel room-entry-panel"><div class="login-hero"><img src="${hotel.logo}" alt="${hotel.name}" /></div><p class="eyebrow">${hotel.name}</p><h1>${roomText('title')}</h1><p class="lead">${roomText('text')}</p><form class="form" id="room-entry"><label>${roomText('room')}<input name="room" inputmode="numeric" pattern="[0-9]{1,6}" autocomplete="off" required></label><button class="btn" type="submit">${roomText('continue')}</button><div id="room-entry-status" aria-live="polite"></div></form></section>`;
}
function cafeView() {
  const products = state.cafeProducts.length ? state.cafeProducts.map(product => {
    const quantity = state.cafeCart.find(item => item.id === product.id)?.quantity || 0;
    const justAdded = state.justAddedId === product.id;
    return `<article class="cafe-product ${justAdded ? 'cafe-product-added' : ''}"><div><h3>${product.name}</h3><p>${product.description || ''}</p><strong>${Number(product.price).toFixed(2)} TRY</strong></div><div class="cafe-quantity-controls"><button class="btn secondary" data-cafe-decrease="${product.id}" type="button" aria-label="${roomText('decrease')} ${product.name}" ${quantity ? '' : 'disabled'}>−</button><span>${quantity}</span><button class="btn secondary" data-cafe-add="${product.id}" type="button" aria-label="${ft('add')} ${product.name}">+</button></div></article>`;
  }).join('') : `<div class="notice"><span class="loading-mark"><img src="${hotel.logo}" alt="" /></span>${roomText('menuLoading')}</div>`;
  const cartTotal = state.cafeCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartDetails = `<div class="cafe-cart"><strong>${roomText('total')}: ${cartTotal.toFixed(2)} TRY</strong><div class="cafe-cart-items">${state.cafeCart.map(item => `<div class="cafe-cart-item"><span>${item.quantity} x ${item.name} · ${(item.quantity * item.price).toFixed(2)} TRY</span></div>`).join('')}</div><fieldset class="payment-choice"><legend>${ft('payment')}</legend><label><input type="radio" name="payment-method" value="cash" ${state.paymentMethod === 'cash' ? 'checked' : ''}> ${ft('cash')}</label><label><input type="radio" name="payment-method" value="card" ${state.paymentMethod === 'card' ? 'checked' : ''}> ${ft('card')}</label><small>${ft('paymentNote')}</small></fieldset><div class="cafe-cart-actions"><button class="btn ghost" data-cafe-clear type="button">${roomText('clearCart')}</button><button class="btn" data-cafe-order type="button">${roomText('order')}</button></div></div>`;
  const cart = state.cafeCart.length
    ? `<button class="cafe-cart-summary" data-cart-open type="button">${icon('cafe')}<span>${state.cafeCart.reduce((sum, item) => sum + item.quantity, 0)} · ${ft('cartTitle')}</span><strong>${cartTotal.toFixed(2)} TRY</strong></button>${state.cafeCartOpen ? `<div class="modal-backdrop" data-cart-modal><section class="success-modal cafe-cart-modal" role="dialog" aria-modal="true" aria-labelledby="cart-title"><button class="modal-close" data-cart-close type="button" aria-label="${c('close')}">×</button><p class="eyebrow">${ft('cartTitle')}</p><h2 id="cart-title">${ft('cartTitle')}</h2>${cartDetails}</section></div>` : ''}`
    : `<div class="notice">${roomText('cartEmpty')}</div>`;
  return `<section><div class="section page-heading"><p class="eyebrow">${roomText('cafe')}</p><h1>${roomText('cafe')}</h1><p class="lead">${roomText('cafeText')}</p></div><div class="cafe-list">${products}</div>${cart}</section>`;
}
function accountModal() {
  if (!state.account) return '';
  const content = state.accountLoading ? `<div class="notification-loading"><span class="loading-mark"><img src="${hotel.logo}" alt="" /></span><p>${roomText('accountLoading')}</p></div>` : state.account.error ? `<div class="notice error">${roomText('menuError')}</div>` : state.account.items.length ? `<div class="account-list">${state.account.items.map(item => `<article class="account-item"><div><strong>${item.type}</strong><span>${item.description.replace(/\n/g, ', ')}</span></div><b>${item.total ? `${item.total.toFixed(2)} ${item.currency}` : ''}</b></article>`).join('')}</div><div class="account-total"><span>${roomText('total')}</span><strong>${state.account.total.toFixed(2)} ${state.account.currency}</strong></div>` : `<p>${roomText('accountEmpty')}</p>`;
  return `<div class="modal-backdrop" data-account-modal><section class="success-modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title"><button class="modal-close" data-account-close type="button" aria-label="${c('close')}">×</button><p class="eyebrow">${roomText('account')}</p><h2 id="account-title">${roomText('accountTitle')}</h2>${content}</section></div>`;
}
function loginView() {
  return `<section class="panel login-panel"><div class="login-hero"><img src="${hotel.logo}" alt="${hotel.name}" /></div><p class="eyebrow">Cityport Hotel · ${c('room')} ${state.room}</p><h1>${t('guestName')}</h1><p class="lead">${t('guestNameHelp')}</p>${state.loginError ? `<div class="notice error">${state.loginError}</div>` : ''}<form class="form" id="guest-login"><label>${t('guestName')}<input name="guestName" autocomplete="name" required value="${state.guestName.replace(/"/g, '&quot;')}"></label><button class="btn" type="submit">${t('continue')}</button><div id="login-status" aria-live="polite"></div></form></section>`;
}
function cleaningBeforeCutoff() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const minutes = Number(parts.find(part => part.type === 'hour')?.value) * 60 + Number(parts.find(part => part.type === 'minute')?.value);
  return minutes < 14 * 60;
}
function homeView() {
  const guestName = state.guest?.guestName || 'Cityport Hotel';
  const dndOn = typeof state.guest?.doNotDisturb?.enabled === 'boolean'
    ? state.guest.doNotDisturb.enabled
    : localStorage.getItem(`cityport_dnd_${state.room}`) === 'true';
  const needsCleaning = state.guest?.statusKey === 'dirty' && !state.guest?.cleaningRequestSentToday && !dndOn;
  const cleaningAvailable = needsCleaning && cleaningBeforeCutoff();
  const cleaningCutoffNotice = needsCleaning && !cleaningBeforeCutoff() ? `<div class="notice cleaning-cutoff-notice">${ft('cleaningCutoff')}</div>` : '';
  const checkoutNotice = isCheckoutToday() ? `<div class="checkout-alert"><span class="checkout-icon">${icon('calendar')}</span><div><strong>${c('checkoutToday')}</strong><span>${c('checkoutTime')}</span></div></div>` : '';
  const stayDatesMarkup = `<div class="stay-dates"><div class="stay-date-item"><span class="stay-date-icon">${icon('calendar')}</span><small>${stayDateText('checkin')}</small><strong>${state.guest?.checkinDate || '-'}</strong></div><span class="badge room-number-badge">${state.room}</span><div class="stay-date-item"><span class="stay-date-icon">${icon('calendar')}</span><small>${stayDateText('checkout')}</small><strong>${state.guest?.checkoutDate || '-'}</strong></div></div>`;
  const toursHtml = (tourContent[state.language] || tourContent.tr).slice(0, 5).map(([name, desc, imageKey]) => `<article class="tour-card"><img src="${tourImages[imageKey]}" alt="${name}" loading="lazy"><div class="tour-card-body"><h3>${name}</h3><p>${desc}</p><span class="tour-note">${tourContact()}</span></div></article>`).join('');
  const mapSection = `<section class="section location-section"><div class="location-card"><p class="eyebrow">Cityport Hotel</p><h2>${staticText('mapTitle')}</h2><div class="map-frame"><iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d188.1791645800616!2d39.7340790616481!3d41.00629218390936!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x40643d8977fc461b%3A0xf60d6953f03363f3!2sCity%20Port%20Hotel!5e0!3m2!1str!2str!4v1789659951827!5m2!1str!2str" title="${staticText('mapTitle')}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div></div></section>`;
  return `${notificationBanner()}<section class="hero"><p class="eyebrow">${t('guestExperience')}</p><h1>${greeting()} ${t('welcome')}</h1><p class="lead">${c('night')}</p></section><section class="welcome"><div class="welcome-photo"><div class="welcome-overlay"><strong>${guestName}</strong></div></div><div class="welcome-content">${stayDatesMarkup}${checkoutNotice}${cleaningCutoffNotice}<div class="room-controls">${cleaningAvailable ? `<button class="room-action" data-cleaning><span>${icon('spark')}</span><strong>${c('clean')}</strong></button>` : ''}<button class="room-action ${dndOn ? 'active' : ''}" data-dnd><span>${icon('bell')}</span><strong>${dndOn ? c('dndOn') : c('dnd')}</strong><i class="toggle"><b></b></i></button></div><div class="welcome-info-strip"><div><small>${t('breakfast')}</small><strong>${hotel.breakfast}</strong></div><div><small>${wifiLabel(0)}</small><strong>${hotel.wifiName}</strong><span>${hotel.wifiPassword}</span></div></div></div></section><section class="section"><div class="section-heading"><p class="eyebrow">${c('quick')}</p><h2>${t('access')}</h2></div><div class="quick-grid"><button class="quick" data-view="request"><span class="quick-icon">${icon('chat')}</span><strong>${t('sendRequest')}</strong></button><button class="quick" data-view="issue"><span class="quick-icon">${icon('tool')}</span><strong>${t('reportIssue')}</strong></button><button class="quick taxi-quick" data-taxi><span class="quick-icon">${icon('taxi')}</span><strong>${taxiText('label')}</strong></button><button class="quick" data-whatsapp><span class="quick-icon">${icon('bell')}</span><strong>${t('contact')}</strong></button></div></section>${state.taxiRequest ? `<section class="taxi-status notice"><strong>${taxiStatusText(state.taxiRequest.status)}</strong><span>${taxiText('expires')}</span>${!['ready', 'cancelled'].includes(state.taxiRequest.status) ? `<button class="btn secondary" data-taxi-cancel>${taxiText('cancelRequest')}</button>` : ''}</section>` : ''}<section class="section home-tours-section"><div class="section-heading"><div><p class="eyebrow">${c('tours')}</p><h2>${c('tours')}</h2></div><button class="btn secondary more-button" data-view="tours">${menuText('tours')} · ${guideUiText('more')}</button></div><div class="tour-grid tour-slider">${toursHtml}</div></section><section class="section trabzon-entry-section"><button class="trabzon-entry-card" data-view="guide"><span class="trabzon-entry-image"></span><span><strong>${(trabzonGuide[state.language] || trabzonGuide.tr).title}</strong><small>${(trabzonGuide[state.language] || trabzonGuide.tr).intro}</small></span><b>→</b></button></section><section class="section"><div class="service-banner"><div class="service-vehicle"></div><div><h2>${c('transfer')}</h2><p>${c('transferText')}</p><div class="service-contact-actions"><a class="btn secondary" href="tel:${hotel.whatsapp}">${transferText('call')}</a><a class="btn secondary" href="https://wa.me/${hotel.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage())}" target="_blank" rel="noreferrer">${transferText('message')}</a></div></div></div></section><section class="section"><div class="panel review-panel"><h2>${t('review')}</h2><p>${t('rating')}</p><button class="btn" data-view="review">${icon('star')} ${t('review')}</button></div></section>${mapSection}`;
}
function tourCardMarkup() {
  return (tourContent[state.language] || tourContent.tr).map(([name, desc, imageKey]) => `<article class="tour-card"><img src="${tourImages[imageKey]}" alt="${name}" loading="lazy"><div class="tour-card-body"><h3>${name}</h3><p>${desc}</p><span class="tour-note">${tourContact()}</span></div></article>`).join('');
}
function toursView() {
  return `<section class="page-view"><div class="section page-heading"><p class="eyebrow">${menuText('tours')}</p><h1>${c('tours')}</h1><p class="lead">${t('explore')}</p></div><div class="tour-grid tours-page-grid">${tourCardMarkup()}</div><div class="panel tour-booking-panel"><strong>${tourContact()}</strong><a class="btn" href="tel:${hotel.phone}">${t('callReception')}</a></div></section>`;
}
function guideView() {
  const guide = trabzonGuide[state.language] || trabzonGuide.tr;
  const places = guide.places.map(([name, description, imageKey, tag]) => `<article class="guide-card"><img src="${guideImages[imageKey]}" alt="${name}" loading="lazy"><div><span class="guide-tag">${tag}</span><h2>${name}</h2><p>${description}</p></div></article>`).join('');
  return `<section class="page-view"><div class="section page-heading"><p class="eyebrow">Cityport Hotel · Trabzon</p><h1>${guide.title}</h1><p class="lead">${guide.intro}</p></div><div class="guide-list">${places}</div><div class="panel guide-tip"><strong>${guideUiText('tip')}</strong><a class="btn" href="tel:${hotel.phone}">${t('callReception')}</a></div></section>`;
}
function menuMarkup() {
  if (!state.menuOpen || !state.guest) return '';
  const items = [['home', 'home', 'home'], ['cafe', 'cafe', 'cafe'], ['taxi', 'taxi', 'taxi'], ['account', 'account', 'calendar'], ['tours', 'tours', 'spark'], ['guide', 'guide', 'globe'], ['request', 'request', 'chat'], ['issue', 'issue', 'tool'], ['review', 'review', 'star']];
  return `<div class="menu-backdrop" data-menu-close><aside class="side-menu" role="dialog" aria-modal="true" aria-labelledby="menu-title"><div class="side-menu-head"><h2 id="menu-title">${menuText('title')}</h2><button class="menu-close" data-menu-close type="button" aria-label="${menuText('close')}">×</button></div><div class="side-menu-language"><label class="language-control"><span>${icon('globe')}</span><select class="lang" aria-label="${t('language')}"><option value="tr" ${state.language === 'tr' ? 'selected' : ''}>TR</option><option value="en" ${state.language === 'en' ? 'selected' : ''}>EN</option><option value="de" ${state.language === 'de' ? 'selected' : ''}>DE</option><option value="ru" ${state.language === 'ru' ? 'selected' : ''}>RU</option><option value="ar" ${state.language === 'ar' ? 'selected' : ''}>AR</option><option value="fa" ${state.language === 'fa' ? 'selected' : ''}>FA</option></select></label></div><div class="side-menu-list">${items.map(([view, label, iconName]) => `<button class="side-menu-item" data-menu-view="${view}" type="button"><span>${icon(iconName)}</span><strong>${menuText(label)}</strong></button>`).join('')}<a class="side-menu-item" href="https://wa.me/${hotel.whatsapp.replace(/\D/g, '')}" target="_blank" rel="noreferrer"><span>${icon('bell')}</span><strong>${menuText('contact')}</strong></a><button class="side-menu-item side-menu-logout" data-logout type="button"><span>↪</span><strong>${menuText('logout')}</strong></button></div></aside></div>`;
}
function formView(title, intro, type) {
  const options = (extraContent[state.language]?.[type === 'issue' ? 'issueOptions' : 'requestOptions'] || extraContent.tr[type === 'issue' ? 'issueOptions' : 'requestOptions']).map(option => `<option value="${option}">${option}</option>`).join('');
  return `<section><div class="section page-heading"><p class="eyebrow">${c('room')} ${state.room}</p><h1>${title}</h1><p class="lead">${intro}</p></div>${type === 'cleaning' ? `<div class="notice cleaning-cutoff-notice">${ft('cleaningCutoff')}</div>` : ''}<div class="panel"><form class="form" id="guest-form" data-type="${type}"><label>${type === 'cleaning' ? t('cleaning') : t('category')}<select name="category">${options}</select></label><label>${t('note')}<textarea name="note" placeholder="${t('note')}"></textarea></label><button class="btn" type="submit">${t('submit')}</button><div id="form-status" aria-live="polite"></div></form></div></section>`;
}
function reviewView() { return `<section><div class="section page-heading"><p class="eyebrow">${c('room')} ${state.room}</p><h1>${c('reviewTitle')}</h1></div><div class="panel"><p>${c('reviewPrompt')}</p><div class="stars">${[1,2,3,4,5].map(n => `<button class="star ${state.rating >= n ? 'active' : ''}" data-rating="${n}" aria-label="${n} yıldız">${icon('star')}</button>`).join('')}</div><div id="review-next">${state.rating && state.rating < 3 ? `<label>${c('commentLabel')}<textarea id="review-comment" placeholder="${c('commentPlaceholder')}"></textarea></label><button class="btn coral" data-low-review>${t('submit')}</button>` : state.rating >= 3 ? `<div class="notice">${c('success')}</div><div class="actions"><a class="btn" target="_blank" rel="noreferrer" href="https://g.page/r/CfNjM_BTaQ32EBM/review">${t('review')}</a></div>` : ''}</div></div></section>`; }
function bind() {
  document.querySelector('.lang')?.addEventListener('change', event => { state.language = event.target.value; localStorage.setItem('cityport_language', state.language); render(); });
  document.querySelector('#room-entry')?.addEventListener('submit', event => { event.preventDefault(); const room = String(new FormData(event.currentTarget).get('room') || '').replace(/[^0-9]/g, '').slice(0, 6); if (!room) { document.querySelector('#room-entry-status').innerHTML = `<div class="notice error">${roomText('invalid')}</div>`; return; } window.location.href = `/?room=${encodeURIComponent(room)}`; });
  document.querySelector('[data-logout]')?.addEventListener('click', logout);
  document.querySelector('[data-banner-dismiss]')?.addEventListener('click', event => event.currentTarget.closest('.notification-banner')?.remove());
  document.querySelectorAll('[data-install-later]').forEach(button => button.addEventListener('click', () => { localStorage.setItem('cityport_install_prompt_seen', 'true'); document.querySelector('[data-install-modal]')?.remove(); }));
  document.querySelector('[data-install-app]')?.addEventListener('click', async event => { event.currentTarget.disabled = true; if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; localStorage.setItem('cityport_install_prompt_seen', 'true'); document.querySelector('[data-install-modal]')?.remove(); });
  document.querySelector('[data-enable-notifications]')?.addEventListener('click', async event => { event.currentTarget.disabled = true; try { await enableNotifications(); } catch (error) { event.currentTarget.disabled = false; console.error('[Cityport] Push subscription failed:', error); } });
  document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('cityport_theme', state.theme);
    render();
  });
  document.querySelector('[data-notifications-open]')?.addEventListener('click', openNotifications);
  document.querySelector('[data-notifications-close]')?.addEventListener('click', () => { state.notificationsOpen = false; render(); });
  document.querySelector('[data-notifications-backdrop]')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) { state.notificationsOpen = false; render(); }
  });
  document.querySelectorAll('[data-notification-read]').forEach(button => button.addEventListener('click', async () => {
    const item = state.notifications.find(notification => notification.id === button.dataset.notificationRead);
    if (!item || item.read) return;
    await updateNotification('read', item.id);
  }));
  document.querySelectorAll('[data-notification-delete]').forEach(button => button.addEventListener('click', async () => {
    await updateNotification('delete', button.dataset.notificationDelete);
  }));
  document.querySelector('[data-account-open]')?.addEventListener('click', openAccount);
  document.querySelector('[data-account-close]')?.addEventListener('click', () => { state.account = null; render(); });
  document.querySelector('#guest-login')?.addEventListener('submit', async event => { event.preventDefault(); state.guestName = new FormData(event.currentTarget).get('guestName').trim(); localStorage.setItem('cityport_guest_name', state.guestName); renderLoading(); await bootstrap(); });
  document.querySelector('[data-menu-open]')?.addEventListener('click', () => { state.menuOpen = true; render(); });
  document.querySelectorAll('[data-menu-close]').forEach(el => el.addEventListener('click', event => { if (event.target === el) { state.menuOpen = false; render(); } }));
  document.querySelectorAll('[data-menu-view]').forEach(el => el.addEventListener('click', () => { if (el.dataset.menuView !== 'account') navigate(el.dataset.menuView); }));
  document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.view)));
  document.querySelector('[data-menu-view="account"]')?.addEventListener('click', () => { state.menuOpen = false; render(); openAccount(); });
  document.querySelector('[data-cart-open]')?.addEventListener('click', () => { state.cafeCartOpen = true; render(); });
  document.querySelector('[data-cart-close]')?.addEventListener('click', () => { state.cafeCartOpen = false; render(); });
  document.querySelector('[data-cart-modal]')?.addEventListener('click', event => { if (event.target === event.currentTarget) { state.cafeCartOpen = false; render(); } });
  if (state.view === 'cafe') loadCafeMenu();
  document.querySelectorAll('[data-cafe-add]').forEach(button => button.addEventListener('click', () => { const product = state.cafeProducts.find(item => item.id === button.dataset.cafeAdd); if (!product) return; const existing = state.cafeCart.find(item => item.id === product.id); if (existing) existing.quantity += 1; else state.cafeCart.push({ id: product.id, name: product.name, price: Number(product.price), quantity: 1 }); state.justAddedId = product.id; render(); window.setTimeout(() => { if (state.justAddedId === product.id) { state.justAddedId = null; render(); } }, 550); }));
  document.querySelector('[data-cafe-order]')?.addEventListener('click', async event => { event.currentTarget.disabled = true; try { await submitCafeOrder(); } catch (error) { event.currentTarget.disabled = false; window.alert(roomText('menuError')); } });
  document.querySelector('[data-cafe-clear]')?.addEventListener('click', () => { state.cafeCart = []; state.cafeCartOpen = false; render(); });
  document.querySelectorAll('[data-cafe-decrease]').forEach(button => button.addEventListener('click', () => { const item = state.cafeCart.find(cartItem => cartItem.id === button.dataset.cafeDecrease); if (!item) return; item.quantity -= 1; if (item.quantity <= 0) state.cafeCart = state.cafeCart.filter(cartItem => cartItem.id !== item.id); render(); }));
  document.querySelectorAll('[name="payment-method"]').forEach(input => input.addEventListener('change', event => { state.paymentMethod = event.target.value; }));
  document.querySelector('[data-whatsapp]')?.addEventListener('click', () => window.open(`https://wa.me/${hotel.whatsapp}?text=${encodeURIComponent(whatsappMessage())}`, '_blank'));
  document.querySelectorAll('[data-rating]').forEach(el => el.addEventListener('click', () => { state.rating = Number(el.dataset.rating); render(); }));
  document.querySelector('[data-low-review]')?.addEventListener('click', () => sendMessage('review', `Düşük puanlı değerlendirme: ${state.rating}/5\n${document.querySelector('#review-comment').value}`));
  document.querySelector('#guest-form')?.addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.currentTarget); await sendMessage(event.currentTarget.dataset.type, `${form.get('category')}\n${form.get('note') || 'Not eklenmedi.'}`); });
  document.querySelector('[data-cleaning]')?.addEventListener('click', openCleaningConfirmation);
  document.querySelector('[data-taxi]')?.addEventListener('click', () => navigate('taxi'));
  document.querySelector('[data-taxi-cancel]')?.addEventListener('click', cancelTaxiRequest);
  document.querySelector('[data-taxi-hotel]')?.addEventListener('click', () => {
    state.taxiPickup = { type: 'hotel', label: taxiPageText('hotel'), latitude: 41.006323, longitude: 39.734137 };
    const label = document.querySelector('.taxi-pickup-current');
    if (label) label.textContent = state.taxiPickup.label;
  });
  document.querySelector('[data-taxi-location]')?.addEventListener('click', selectTaxiCurrentLocation);
  document.querySelector('#taxi-destination')?.addEventListener('input', event => {
    state.taxiDestination = null;
    state.taxiSuggestions = [];
    if (state.taxiSearchTimer) window.clearTimeout(state.taxiSearchTimer);
    const query = event.target.value.trim();
    if (query.length < 3) {
      const list = document.querySelector('#taxi-suggestions');
      if (list) list.replaceChildren();
      return;
    }
    const list = document.querySelector('#taxi-suggestions');
    if (list) list.textContent = taxiPageText('searching');
    state.taxiSearchTimer = window.setTimeout(() => loadTaxiSuggestions(query), 350);
  });
  document.querySelector('#taxi-suggestions')?.addEventListener('click', event => {
    const button = event.target.closest('[data-taxi-suggestion]');
    if (!button) return;
    const selected = state.taxiSuggestions[Number(button.dataset.taxiSuggestion)];
    if (!selected) return;
    state.taxiDestination = selected;
    state.taxiSuggestions = [];
    const input = document.querySelector('#taxi-destination');
    const list = document.querySelector('#taxi-suggestions');
    if (input) input.value = selected.label;
    if (list) list.replaceChildren();
  });
  document.querySelector('#taxi-form')?.addEventListener('submit', requestTaxi);
  document.querySelector('[name="passengers"]')?.addEventListener('change', event => { state.taxiPassengerCount = Number(event.target.value); });
  document.querySelectorAll('[name="taxi-payment"]').forEach(input => input.addEventListener('change', event => { state.taxiPaymentMethod = event.target.value; }));
  document.querySelector('[data-dnd]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const next = !(state.guest?.doNotDisturb?.enabled === true);
    button.disabled = true;
    try {
      const response = await fetch('/api/do-not-disturb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: state.room, guestName: state.guestName, idToken: state.idToken, enabled: next }) });
      if (!response.ok) throw new Error('dnd_save_failed');
      const result = await response.json();
      state.guest.doNotDisturb = result.doNotDisturb;
      localStorage.setItem(`cityport_dnd_${state.room}`, String(next));
      sendMessage('status_toggle', next ? c('dndOn') : c('dnd'));
      render();
    } catch (error) {
      button.disabled = false;
      window.alert(c('genericError'));
    }
  });
}
function navigate(view) {
  state.view = view;
  state.menuOpen = false;
  state.pageTransition = true;
  render();
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}
function logout() {
  if (notificationRefreshTimer) window.clearInterval(notificationRefreshTimer);
  notificationRefreshTimer = null;
  state.guest = null;
  state.idToken = null;
  state.guestName = '';
  state.needsGuestLogin = true;
  state.loginError = null;
  state.view = 'home';
  localStorage.removeItem('cityport_session_active');
  localStorage.removeItem('cityport_guest_name');
  localStorage.removeItem('cityport_checkout');
  render();
}
function isTrabzonCoordinates(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= 40.3 && latitude <= 41.4
    && longitude >= 39.1 && longitude <= 40.8;
}
function isTrabzonFeature(feature) {
  const properties = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates || [];
  return String(properties.countrycode || '').toUpperCase() === 'TR'
    && isTrabzonCoordinates(Number(coordinates[1]), Number(coordinates[0]));
}
function formatTaxiAddress(feature) {
  const properties = feature.properties || {};
  return [...new Set([properties.name, properties.street, properties.housenumber, properties.district, properties.city, properties.state].filter(Boolean))]
    .join(', ');
}
async function loadTaxiSuggestions(query) {
  try {
    const params = new URLSearchParams({
      q: query,
      lat: '41.006323',
      lon: '39.734137',
      limit: '8',
      lang: ['en', 'de', 'fr'].includes(state.language) ? state.language : 'default',
      bbox: '39.1,40.3,40.8,41.4'
    });
    const response = await fetch(`https://photon.komoot.io/api/?${params}`);
    if (!response.ok) throw new Error(`Photon returned ${response.status}`);
    const result = await response.json();
    if (state.view !== 'taxi' || document.querySelector('#taxi-destination')?.value.trim() !== query) return;
    state.taxiSuggestions = (result.features || [])
      .filter(isTrabzonFeature)
      .map(feature => ({
        label: formatTaxiAddress(feature),
        latitude: Number(feature.geometry?.coordinates?.[1]),
        longitude: Number(feature.geometry?.coordinates?.[0])
      }))
      .filter(item => item.label && isTrabzonCoordinates(item.latitude, item.longitude))
      .slice(0, 6);
    const list = document.querySelector('#taxi-suggestions');
    if (!list) return;
    list.innerHTML = state.taxiSuggestions.length
      ? state.taxiSuggestions.map((item, index) => `<button class="taxi-suggestion" type="button" role="option" data-taxi-suggestion="${index}">${escapeHtml(item.label)}</button>`).join('')
      : `<span class="taxi-suggestion-empty">${taxiPageText('noResults')}</span>`;
  } catch (error) {
    console.error('[Cityport] Taxi address lookup failed:', error?.message || error);
    const list = document.querySelector('#taxi-suggestions');
    if (list) list.innerHTML = `<span class="taxi-suggestion-empty">${taxiPageText('searchError')}</span>`;
  }
}
function selectTaxiCurrentLocation(event) {
  const button = event.currentTarget;
  const status = document.querySelector('.taxi-location-status');
  if (!navigator.geolocation) {
    if (status) status.textContent = taxiLocationText('unavailable');
    return;
  }
  button.disabled = true;
  if (status) status.textContent = taxiPageText('locating');
  navigator.geolocation.getCurrentPosition(async position => {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    try {
      if (!isTrabzonCoordinates(latitude, longitude)) throw new Error('outside_trabzon');
      const params = new URLSearchParams({
        lat: String(latitude),
        lon: String(longitude),
        lang: ['en', 'de', 'fr'].includes(state.language) ? state.language : 'default'
      });
      const response = await fetch(`https://photon.komoot.io/reverse?${params}`);
      if (!response.ok) throw new Error('reverse_lookup_failed');
      const result = await response.json();
      const feature = result.features?.find(isTrabzonFeature);
      if (!feature) throw new Error('outside_trabzon');
      state.taxiPickup = {
        type: 'location',
        label: formatTaxiAddress(feature) || taxiPageText('myLocation'),
        latitude,
        longitude
      };
      const label = document.querySelector('.taxi-pickup-current');
      if (label) label.textContent = state.taxiPickup.label;
      if (status) status.textContent = '';
    } catch (error) {
      if (status) status.textContent = error.message === 'outside_trabzon'
        ? taxiPageText('locationOutside')
        : taxiLocationText('unavailable');
    } finally {
      button.disabled = false;
    }
  }, error => {
    button.disabled = false;
    if (status) status.textContent = error.code === 1
      ? taxiLocationText('denied')
      : taxiLocationText('unavailable');
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}
async function requestTaxi(event) {
  event.preventDefault();
  if (state.taxiSubmitting) return;
  const form = event.currentTarget;
  const destinationText = form.querySelector('#taxi-destination').value.trim();
  const passengerCount = Number(new FormData(form).get('passengers'));
  const pickup = state.taxiPickup;
  if (destinationText && !state.taxiDestination) {
    state.taxiNotice = taxiPageText('noResults');
    render();
    return;
  }
  if (!pickup || !isTrabzonCoordinates(Number(pickup.latitude), Number(pickup.longitude))) {
    state.taxiNotice = taxiPageText('locationOutside');
    render();
    return;
  }
  state.taxiSubmitting = true;
  state.taxiNotice = null;
  render();
  try {
    const destination = state.taxiDestination;
    const response = await fetch('/api/taxi-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: state.room,
        guestName: state.guestName,
        idToken: state.idToken,
        language: state.language,
        passengerCount,
        paymentMethod: state.taxiPaymentMethod,
        pickup,
        destination
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok && result.code !== 'TAXI_SAVED_TELEGRAM_FAILED') throw new Error(result.error || 'taxi_request_failed');
    state.taxiRequest = {
      room: state.room,
      requestId: result.requestId,
      expiresAt: result.expiresAt,
      status: 'pending'
    };
    localStorage.setItem('cityport_taxi_request', JSON.stringify(state.taxiRequest));
    scheduleTaxiExpiry();
    state.taxiSubmitting = false;
    state.taxiNotice = result.code === 'TAXI_SAVED_TELEGRAM_FAILED' ? taxiPageText('savedNotNotified') : null;
    render();
  } catch (error) {
    console.error('[Cityport] Taxi request failed:', error?.message || error);
    state.taxiSubmitting = false;
    state.taxiNotice = taxiPageText('error');
    render();
  }
}
function scheduleTaxiExpiry() {
  if (!state.taxiRequest) return;
  const requestId = state.taxiRequest.requestId;
  const delay = Math.max(0, Number(state.taxiRequest.expiresAt) - Date.now());
  window.setTimeout(() => {
    if (state.taxiRequest?.requestId !== requestId) return;
    state.taxiRequest = null;
    localStorage.removeItem('cityport_taxi_request');
    render();
  }, delay);
}
async function cancelTaxiRequest() {
  if (!state.taxiRequest) return;
  try {
    const response = await fetch('/api/taxi-request', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: state.room, guestName: state.guestName, idToken: state.idToken, requestId: state.taxiRequest.requestId }) });
    if (!response.ok) throw new Error('taxi_cancel_failed');
    state.taxiRequest = null;
    localStorage.removeItem('cityport_taxi_request');
    render();
  } catch (error) {
    window.alert(staticText('taxiCancelError'));
  }
}
async function sendMessage(type, detail) {
  const status = document.querySelector('#form-status') || document.querySelector('#review-next');
  if (status) status.innerHTML = `<div class="notice">${c('sending')}</div>`;
  try {
    const response = await fetch('/api/send-telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, room: state.room, detail, guestName: state.guestName, idToken: state.idToken, language: state.language })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      if (result.code === 'CLEANING_DAILY_LIMIT') throw new Error('daily_cleaning_limit');
      if (result.code === 'CLEANING_CUTOFF_PASSED') throw new Error('cleaning_cutoff');
      if (result.code === 'FIREBASE_CLEANING_HISTORY_READ_FAILED') throw new Error('cleaning_history_error');
      if (result.code === 'DAILY_REQUEST_LIMIT') throw new Error('daily_request_limit');
      if (result.code === 'DUPLICATE_REQUEST') throw new Error('duplicate_request');
      throw new Error('send_failed');
    }
    if (type === 'request' || type === 'issue' || type === 'cleaning') showSuccessModal();
    else if (status) status.innerHTML = `<div class="notice">${c('sent')}</div>`;
  } catch (error) {
    const message = {
      daily_cleaning_limit: c('dailyLimit'),
      cleaning_cutoff: ft('cleaningCutoff'),
      cleaning_history_error: staticText('cleaningHistoryError'),
      daily_request_limit: ft('dailyLimit'),
      duplicate_request: ft('duplicate')
    }[error.message] || c('genericError');
    if (status) status.innerHTML = `<div class="notice error">${message}</div>`;
  }
}
async function loadCafeMenu() {
  if (state.cafeProducts.length) return;
  try {
    const response = await fetch('/api/cafe');
    if (!response.ok) throw new Error('cafe_menu_failed');
    state.cafeProducts = (await response.json()).products || [];
    render();
  } catch (error) {
    const target = document.querySelector('.cafe-list');
    if (target) target.innerHTML = `<div class="notice error">${roomText('menuError')}</div>`;
  }
}
async function submitCafeOrder() {
  if (!state.cafeCart.length) return;
  const response = await fetch('/api/cafe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: state.room, guestName: state.guestName, idToken: state.idToken, language: state.language, paymentMethod: state.paymentMethod, items: state.cafeCart.map(item => ({ id: item.id, quantity: item.quantity })) }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok && result.code === 'ORDER_SAVED_TELEGRAM_FAILED') {
    state.cafeCart = [];
    state.cafeCartOpen = false;
    render();
    window.alert(roomText('orderRecordedNotNotified'));
    return;
  }
  if (!response.ok) throw new Error(result.error || 'cafe_order_failed');
  state.cafeCart = [];
  showSuccessModal();
}
async function notificationRequest(action, notificationId) {
  const response = await fetch('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, notificationId, room: state.room, guestName: state.guestName, idToken: state.idToken, language: state.language })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'notification_request_failed');
  return result;
}
function syncTaxiStatus(items) {
  if (!state.taxiRequest?.requestId) return false;
  const notification = items.find(item => item.kind === 'taxi' && item.requestId === state.taxiRequest.requestId);
  if (!notification) return false;
  const status = notification.statusAction === 'called' ? 'called'
    : notification.statusAction === 'ready' ? 'ready'
      : notification.statusAction === 'cancel' ? 'cancelled' : null;
  if (!status || state.taxiRequest.status === status) return false;
  state.taxiRequest.status = status;
  localStorage.setItem('cityport_taxi_request', JSON.stringify(state.taxiRequest));
  return true;
}
async function loadNotifications() {
  state.notificationsLoading = true;
  state.notificationsError = false;
  render();
  try {
    const result = await notificationRequest('list');
    state.notifications = result.items || [];
    syncTaxiStatus(state.notifications);
  } catch (error) {
    state.notificationsError = true;
    console.error('[Cityport] Notification list failed:', error?.message || error);
  } finally {
    state.notificationsLoading = false;
    render();
  }
}
async function openNotifications() {
  state.notificationsOpen = true;
  state.notificationsLoading = true;
  state.notificationsError = false;
  render();
  try {
    const result = await notificationRequest('list');
    state.notifications = result.items || [];
    syncTaxiStatus(state.notifications);
  } catch (error) {
    state.notificationsError = true;
    console.error('[Cityport] Notification list failed:', error?.message || error);
  } finally {
    state.notificationsLoading = false;
    render();
  }
}
async function updateNotification(action, id) {
  try {
    await notificationRequest(action, id);
    if (action === 'delete') state.notifications = state.notifications.filter(item => item.id !== id);
    else state.notifications = state.notifications.map(item => item.id === id ? { ...item, read: true } : item);
    state.notificationsError = false;
    render();
  } catch (error) {
    state.notificationsError = true;
    console.error('[Cityport] Notification update failed:', error?.message || error);
    render();
  }
}
async function openAccount() {
  state.accountLoading = true;
  state.account = { items: [], total: 0, currency: 'TRY' };
  render();
  try {
    const response = await fetch('/api/guest-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: state.room, guestName: state.guestName, idToken: state.idToken }) });
    if (!response.ok) throw new Error('account_failed');
    state.account = await response.json();
  } catch (error) {
    state.account = { items: [], total: 0, currency: 'TRY', error: true };
  } finally {
    state.accountLoading = false;
    render();
  }
}
  function showSuccessModal() { document.querySelector('#success-modal')?.remove(); const modal = document.createElement('div'); modal.id = 'success-modal'; modal.className = 'modal-backdrop'; modal.innerHTML = `<div class="success-modal" role="dialog" aria-modal="true"><span class="success-mark">✓</span><h2>${c('success')}</h2><p>${c('successText')}</p><button class="btn" data-modal-home>${c('home')}</button><button class="modal-close" data-modal-close aria-label="${c('close')}">×</button></div>`; document.body.appendChild(modal); const returnHome = () => { modal.remove(); navigate('home'); window.location.reload(); }; modal.querySelector('[data-modal-home]').addEventListener('click', returnHome); modal.querySelector('[data-modal-close]').addEventListener('click', returnHome); }
function openCleaningConfirmation() {
  document.querySelector('#cleaning-confirmation')?.remove();
  const modal = document.createElement('div');
  modal.id = 'cleaning-confirmation';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<div class="success-modal confirmation-modal" role="dialog" aria-modal="true"><button class="modal-close" data-confirm-cancel aria-label="${c('cancel')}">×</button><p class="eyebrow">${c('clean')}</p><h2>${c('cleaningPrompt')}</h2><p class="cleaning-cutoff-notice">${ft('cleaningCutoff')}</p><div class="confirmation-actions"><button class="btn" data-cleaning-time="now">${c('now')}</button><button class="btn secondary" data-cleaning-time="today">${c('today')}</button><button class="btn ghost" data-confirm-cancel>${c('cancel')}</button></div></div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-confirm-cancel]').forEach(button => button.addEventListener('click', () => modal.remove()));
  modal.querySelectorAll('[data-cleaning-time]').forEach(button => button.addEventListener('click', () => { const timing = button.dataset.cleaningTime === 'now' ? c('now') : c('today'); modal.remove(); sendMessage('cleaning', `${c('clean')} - ${timing}`); }));
}
async function signInAnonymously() {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(firebaseWebApiKey)}`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ returnSecureToken: true }) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `AUTH_HTTP_${response.status}`);
  }
  return response.json();
}
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('location_unavailable'));
    const readings = [];
    const finish = () => readings.length ? resolve(readings.sort((a, b) => a.accuracy - b.accuracy)[0]) : reject(new Error('location_unavailable'));
    const watchId = navigator.geolocation.watchPosition(position => { readings.push({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }); if (position.coords.accuracy <= 80 || readings.length >= 3) { navigator.geolocation.clearWatch(watchId); finish(); } }, error => { if (!readings.length) reject(error); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    window.setTimeout(() => { navigator.geolocation.clearWatch(watchId); finish(); }, 15000);
  });
}
async function bootstrap() {
  if (storedCheckoutHasPassed()) {
    state.validationError = 'Konaklamanız sona ermiştir. Bu uygulamaya yeniden erişmek için resepsiyonla iletişime geçin.';
    localStorage.removeItem('cityport_room');
    localStorage.removeItem('cityport_checkout');
    render();
    return;
  }
  let validationResponse;
  try {
    if (!state.guestName) { state.needsGuestLogin = true; render(); return; }
    const auth = await signInAnonymously();
    state.idToken = auth.idToken;
    validationResponse = await fetch('/api/validate-guest', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ room: state.room, guestName: state.guestName, idToken: state.idToken }) });
    const result = await validationResponse.json();
    state.validationReason = result.reason || null;
    state.serverCode = result.code || null;
    if (result.distanceMeters !== null && result.distanceMeters !== undefined) state.validationDetails = `${result.distanceMeters} m / ${result.allowedRadiusMeters + Math.min(result.accuracyMeters || 0, 250)} m (${result.accuracyMeters || '?'} m GPS)`;
    if (!validationResponse.ok) throw new Error(result.error || 'invalid_guest');
    state.guest = result;
    state.needsGuestLogin = false;
    state.loginError = null;
    state.room = state.guest.room;
    localStorage.setItem('cityport_session_active', 'true');
    localStorage.setItem('cityport_room', state.room);
    localStorage.setItem('cityport_checkout', state.guest.checkoutDate);
    render();
    loadNotifications();
    startNotificationRefresh();
  } catch (error) {
    let message = t('authError');
    if (validationResponse?.status === 403) message = t('nameMismatch');
    if (validationResponse?.status === 401) message = t('ended');
    if (validationResponse?.status >= 500) message = t('serverError');
    if (!validationResponse) message = `${t('authError')} (${error.message})`;
    state.loginError = message;
    state.needsGuestLogin = true;
    state.validationError = null;
    render();
  }
}
function enablePullToRefresh() {
  if (!('ontouchstart' in window)) return;
  const indicator = document.createElement('div');
  indicator.id = 'pull-refresh-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  indicator.textContent = '↻';
  document.body.appendChild(indicator);
  let startY = 0;
  let pulling = false;
  let ready = false;

  const reset = () => {
    pulling = false;
    ready = false;
    document.body.classList.remove('refreshing');
    indicator.classList.remove('visible', 'ready');
    indicator.style.transform = '';
  };

  document.addEventListener('touchstart', event => {
    if (window.scrollY > 0 || document.querySelector('.modal-backdrop') || event.target.closest('input, textarea, select, button, a')) return;
    startY = event.touches[0].clientY;
    pulling = true;
  }, { passive: true });

  document.addEventListener('touchmove', event => {
    if (!pulling) return;
    const distance = event.touches[0].clientY - startY;
    if (distance <= 0) return reset();
    event.preventDefault();
    const progress = Math.min(distance, 120);
    ready = distance >= 80;
    indicator.classList.add('visible');
    indicator.classList.toggle('ready', ready);
    indicator.style.transform = `translate(-50%, ${Math.max(0, progress - 58)}px) rotate(${progress * 2.5}deg)`;
    document.body.classList.add('refreshing');
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (!pulling) return;
    if (ready) {
      indicator.textContent = '…';
      window.location.reload();
      return;
    }
    reset();
  }, { passive: true });
  document.addEventListener('touchcancel', reset, { passive: true });
}
enablePullToRefresh();
scheduleTaxiExpiry();
if (!navigator.onLine) {
  renderOffline();
} else if (!state.room) {
  render();
} else {
  renderLoading();
  bootstrap();
}
window.addEventListener('offline', () => { if (!state.guest) renderOffline(); });
window.addEventListener('online', () => { if (!state.guest) { renderLoading(); bootstrap(); } });
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstallPrompt = event; if (state.guest) render(); });
window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; localStorage.setItem('cityport_install_prompt_seen', 'true'); document.querySelector('[data-install-modal]')?.remove(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').then(registration => registration.update()).catch(() => {});