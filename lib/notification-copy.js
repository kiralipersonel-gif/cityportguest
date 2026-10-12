const checkoutMessages = {
  tr: ['Bugün çıkış gününüz', 'Lütfen odanızı saat 12:00’ye kadar boşaltın.'],
  en: ['Today is your checkout day', 'Please vacate your room by 12:00.'],
  de: ['Heute ist Ihr Abreisetag', 'Bitte verlassen Sie Ihr Zimmer bis 12:00 Uhr.'],
  ru: ['Сегодня день выезда', 'Пожалуйста, освободите номер до 12:00.'],
  ar: ['اليوم هو يوم المغادرة', 'يرجى إخلاء الغرفة قبل الساعة 12:00.'],
  fa: ['امروز روز خروج شماست', 'لطفاً اتاق را تا ساعت ۱۲:۰۰ تخلیه کنید.']
};

const statusMessages = {
  tr: {
    request: { working: ['Talebiniz işleme alındı', 'Talebiniz işleme alındı.'], done: ['Talebiniz tamamlandı', 'Talebiniz tamamlandı.'], cancel: ['Talebiniz iptal edildi', 'Talebiniz iptal edildi.'] },
    issue: { working: ['Arızanız işleme alındı', 'Arıza kaydınız işleme alındı.'], done: ['Arızanız giderildi', 'Arıza kaydınız tamamlandı.'], cancel: ['Arıza kaydı iptal edildi', 'Arıza kaydınız iptal edildi.'] },
    order: { done: ['Siparişiniz tamamlandı', 'Kafe siparişiniz tamamlandı.'], cancel: ['Siparişiniz iptal edildi', 'Kafe siparişiniz iptal edildi.'] }
  },
  en: {
    request: { working: ['Request in progress', 'Your request is being processed.'], done: ['Request completed', 'Your request has been completed.'], cancel: ['Request cancelled', 'Your request has been cancelled.'] },
    issue: { working: ['Issue in progress', 'Your issue is being handled.'], done: ['Issue resolved', 'Your issue has been resolved.'], cancel: ['Issue cancelled', 'Your issue report has been cancelled.'] },
    order: { done: ['Order completed', 'Your cafe order has been completed.'], cancel: ['Order cancelled', 'Your cafe order has been cancelled.'] }
  },
  de: {
    request: { working: ['Anfrage in Bearbeitung', 'Ihre Anfrage wird bearbeitet.'], done: ['Anfrage abgeschlossen', 'Ihre Anfrage wurde abgeschlossen.'], cancel: ['Anfrage storniert', 'Ihre Anfrage wurde storniert.'] },
    issue: { working: ['Störung in Bearbeitung', 'Ihre Störungsmeldung wird bearbeitet.'], done: ['Störung behoben', 'Ihre Störung wurde behoben.'], cancel: ['Meldung storniert', 'Ihre Störungsmeldung wurde storniert.'] },
    order: { done: ['Bestellung abgeschlossen', 'Ihre Café-Bestellung wurde abgeschlossen.'], cancel: ['Bestellung storniert', 'Ihre Café-Bestellung wurde storniert.'] }
  },
  ru: {
    request: { working: ['Запрос в работе', 'Ваш запрос обрабатывается.'], done: ['Запрос выполнен', 'Ваш запрос выполнен.'], cancel: ['Запрос отменён', 'Ваш запрос отменён.'] },
    issue: { working: ['Проблема в работе', 'Вашей заявкой занимаются.'], done: ['Проблема устранена', 'Ваша проблема устранена.'], cancel: ['Заявка отменена', 'Ваша заявка отменена.'] },
    order: { done: ['Заказ выполнен', 'Ваш заказ в кафе выполнен.'], cancel: ['Заказ отменён', 'Ваш заказ в кафе отменён.'] }
  },
  ar: {
    request: { working: ['الطلب قيد المعالجة', 'يجري العمل على طلبك.'], done: ['اكتمل الطلب', 'تم إكمال طلبك.'], cancel: ['أُلغي الطلب', 'تم إلغاء طلبك.'] },
    issue: { working: ['العطل قيد المعالجة', 'يجري العمل على بلاغ العطل.'], done: ['تم إصلاح العطل', 'تم حل مشكلة العطل.'], cancel: ['أُلغي البلاغ', 'تم إلغاء بلاغ العطل.'] },
    order: { done: ['اكتمل الطلب', 'تم إكمال طلب المقهى.'], cancel: ['أُلغي الطلب', 'تم إلغاء طلب المقهى.'] }
  },
  fa: {
    request: { working: ['درخواست در حال پیگیری', 'درخواست شما در حال رسیدگی است.'], done: ['درخواست تکمیل شد', 'درخواست شما تکمیل شد.'], cancel: ['درخواست لغو شد', 'درخواست شما لغو شد.'] },
    issue: { working: ['گزارش در حال پیگیری', 'گزارش مشکل شما در حال رسیدگی است.'], done: ['مشکل برطرف شد', 'مشکل گزارش‌شده برطرف شد.'], cancel: ['گزارش لغو شد', 'گزارش مشکل شما لغو شد.'] },
    order: { done: ['سفارش تکمیل شد', 'سفارش کافه شما تکمیل شد.'], cancel: ['سفارش لغو شد', 'سفارش کافه شما لغو شد.'] }
  }
};

const taxiStatusMessages = {
  tr: {
    called: ['Taksi çağrıldı', 'Taksi talebiniz için araç çağrıldı.'],
    ready: ['Taksiniz hazır', 'Taksiniz alınış noktasında hazır.'],
    cancel: ['Taksi talebi iptal edildi', 'Taksi talebiniz iptal edildi.']
  },
  en: {
    called: ['Taxi called', 'A taxi has been called for your request.'],
    ready: ['Your taxi is ready', 'Your taxi is ready at the pickup location.'],
    cancel: ['Taxi request cancelled', 'Your taxi request has been cancelled.']
  },
  de: {
    called: ['Taxi wurde gerufen', 'Für Ihre Anfrage wurde ein Taxi gerufen.'],
    ready: ['Ihr Taxi ist bereit', 'Ihr Taxi wartet am Abholort.'],
    cancel: ['Taxianfrage storniert', 'Ihre Taxianfrage wurde storniert.']
  },
  ru: {
    called: ['Такси вызвано', 'Для вас вызвали такси.'],
    ready: ['Такси готово', 'Такси ожидает вас в месте подачи.'],
    cancel: ['Заказ такси отменён', 'Ваш заказ такси отменён.']
  },
  ar: {
    called: ['تم استدعاء سيارة الأجرة', 'تم استدعاء سيارة أجرة لطلبك.'],
    ready: ['السيارة جاهزة', 'السيارة بانتظارك في موقع الالتقاء.'],
    cancel: ['تم إلغاء طلب السيارة', 'تم إلغاء طلب سيارة الأجرة.']
  },
  fa: {
    called: ['تاکسی فراخوانده شد', 'برای درخواست شما تاکسی فراخوانده شد.'],
    ready: ['تاکسی آماده است', 'تاکسی در محل سوارشدن منتظر شماست.'],
    cancel: ['درخواست تاکسی لغو شد', 'درخواست تاکسی شما لغو شد.']
  }
};

export function getCheckoutNotificationCopy(language) {
  return checkoutMessages[language] || checkoutMessages.tr;
}

export function getStatusNotificationCopy(kind, action, language) {
  if (kind === 'taxi') {
    return taxiStatusMessages[language]?.[action]
      || taxiStatusMessages.tr[action]
      || ['Cityport Hotel', 'Taxi request status updated.'];
  }
  return statusMessages[language]?.[kind]?.[action]
    || statusMessages.tr[kind]?.[action]
    || ['Cityport Hotel', 'Your status has been updated.'];
}
