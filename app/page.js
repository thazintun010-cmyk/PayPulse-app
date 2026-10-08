'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Copy,
  FileText,
  ImageDown,
  LayoutDashboard,
  Languages,
  Mail,
  Plus,
  Search,
  Settings2,
  Share2,
  Trash2,
  Upload,
  WalletCards,
} from 'lucide-react';
import {
  deleteInvoice,
  exportBackupData,
  getAllInvoices,
  getSetting,
  importBackupData,
  saveInvoice,
  saveSetting,
} from '../lib/db';

const emptyProfile = {
  name: '',
  phone: '',
  logo: '',
  paymentMethod: 'KBZPay',
  accountNo: '',
};

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function newInvoiceForm(profile = emptyProfile) {
  return {
    id: `PP-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
    clientName: '',
    clientPhone: '',
    clientEmail: '',
    dueDate: localDateString(new Date(Date.now() + 7 * 86400000)),
    paymentMethod: profile.paymentMethod || 'KBZPay',
    accountNo: profile.accountNo || '',
    items: [{ description: '', quantity: 1, unitPrice: '' }],
  };
}

function invoiceStatus(invoice) {
  if (invoice.status === 'Paid') return 'Paid';
  return invoice.dueDate && invoice.dueDate < localDateString() ? 'Overdue' : 'Pending';
}

function invoiceTotal(items = []) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
}

function formatMoney(amount) {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount || 0)} Ks`;
}

function formatDate(value, language) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(language === 'my' ? 'en-GB' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));
}

function StatusBadge({ status, my }) {
  const labels = my
    ? { Paid: 'ပေးချေပြီး', Pending: 'မပေးရသေး', Overdue: 'ရက်ကျော်' }
    : { Paid: 'Paid', Pending: 'Pending', Overdue: 'Overdue' };
  return <span className={`status-badge status-${status.toLowerCase()}`}><span />{labels[status]}</span>;
}

export default function PayPulseApp() {
  const [appLang, setAppLang] = useState('my');
  const [pdfLang, setPdfLang] = useState('en');
  const [activeTab, setActiveTab] = useState('overview');
  const [invoices, setInvoices] = useState([]);
  const [profile, setProfile] = useState(emptyProfile);
  const [qrCode, setQrCode] = useState('');
  const [formData, setFormData] = useState(() => newInvoiceForm());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [toast, setToast] = useState('');
  const [ready, setReady] = useState(false);
  const invoiceRef = useRef(null);
  const restoreRef = useRef(null);
  const my = appLang === 'my';

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [savedInvoices, savedProfile, savedQr, preferences] = await Promise.all([
          getAllInvoices(),
          getSetting('profile'),
          getSetting('qrCode'),
          getSetting('preferences'),
        ]);
        if (!active) return;
        const nextProfile = { ...emptyProfile, ...(savedProfile || {}) };
        setInvoices(savedInvoices || []);
        setProfile(nextProfile);
        setQrCode(savedQr || '');
        if (preferences?.appLang) setAppLang(preferences.appLang);
        if (preferences?.pdfLang) setPdfLang(preferences.pdfLang);
        setFormData(newInvoiceForm(nextProfile));
      } catch (error) {
        console.error('Unable to load PayPulse data', error);
        setToast('Local storage could not be opened in this browser.');
      } finally {
        if (active) setReady(true);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const sortedInvoices = useMemo(
    () => [...invoices].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [invoices],
  );
  const visibleInvoices = sortedInvoices.filter((invoice) => {
    const matchesQuery = `${invoice.clientName} ${invoice.id}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (filter === 'All' || invoiceStatus(invoice) === filter);
  });
  const total = invoiceTotal(formData.items);
  const totals = invoices.reduce((result, invoice) => {
    const status = invoiceStatus(invoice);
    result[status] += Number(invoice.amount || invoiceTotal(invoice.items));
    return result;
  }, { Paid: 0, Pending: 0, Overdue: 0 });

  function showToast(message) {
    setToast(message);
  }

  async function changeLanguage(nextLanguage, type) {
    if (type === 'app') setAppLang(nextLanguage);
    else setPdfLang(nextLanguage);
    await saveSetting('preferences', {
      appLang: type === 'app' ? nextLanguage : appLang,
      pdfLang: type === 'pdf' ? nextLanguage : pdfLang,
    });
  }

  function updateItem(index, key, value) {
    setFormData((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }));
  }

  function updateProfile(key, value) {
    const updated = { ...profile, [key]: value };
    setProfile(updated);
    saveSetting('profile', updated);
  }

  async function readImage(file, onLoad) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast(my ? 'ပုံဖိုင်ကိုသာ ရွေးချယ်ပါ။' : 'Choose an image file.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      showToast(my ? 'ပုံဖိုင်အရွယ်အစား 3 MB ထက် မကျော်ရပါ။' : 'Images must be smaller than 3 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => onLoad(reader.result);
    reader.readAsDataURL(file);
  }

  async function saveCurrentInvoice(event) {
    event.preventDefault();
    const validItems = formData.items.filter((item) => item.description.trim() && Number(item.unitPrice) > 0);
    if (!formData.clientName.trim() || !validItems.length || total <= 0) {
      showToast(my ? 'ဖောက်သည်အမည်နှင့် ပစ္စည်း/ဝန်ဆောင်မှု ဈေးနှုန်းကို ဖြည့်ပါ။' : 'Add a client and at least one priced item.');
      return;
    }
    const invoice = {
      ...formData,
      items: validItems.map((item) => ({ ...item, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })),
      amount: invoiceTotal(validItems),
      status: 'Pending',
      createdAt: new Date().toISOString(),
      senderName: profile.name,
      senderPhone: profile.phone,
      qrCode,
    };
    await saveInvoice(invoice);
    setInvoices((current) => [invoice, ...current.filter((item) => item.id !== invoice.id)]);
    setFormData(newInvoiceForm(profile));
    setActiveTab('overview');
    showToast(my ? 'Invoice ကို ဒီစက်ထဲမှာ သိမ်းပြီးပါပြီ။' : 'Invoice saved on this device.');
  }

  async function setInvoiceStatus(invoice, status) {
    const updated = { ...invoice, status };
    await saveInvoice(updated);
    setInvoices((current) => current.map((item) => item.id === invoice.id ? updated : item));
    showToast(status === 'Paid' ? (my ? 'ပေးချေပြီးဟု မှတ်သားလိုက်ပါပြီ။' : 'Marked as paid.') : (my ? 'မပေးရသေးဟု ပြန်ပြောင်းလိုက်ပါပြီ။' : 'Marked as pending.'));
  }

  async function removeInvoice(invoice) {
    const confirmed = window.confirm(my ? 'ဒီ invoice ကို ဖျက်မှာ သေချာပါသလား။' : 'Delete this invoice?');
    if (!confirmed) return;
    await deleteInvoice(invoice.id);
    setInvoices((current) => current.filter((item) => item.id !== invoice.id));
    showToast(my ? 'Invoice ကို ဖျက်ပြီးပါပြီ။' : 'Invoice deleted.');
  }

  function editInvoice(invoice) {
    setFormData({
      id: invoice.id,
      clientName: invoice.clientName,
      clientPhone: invoice.clientPhone || '',
      clientEmail: invoice.clientEmail || '',
      dueDate: invoice.dueDate || '',
      paymentMethod: invoice.paymentMethod || profile.paymentMethod,
      accountNo: invoice.accountNo || profile.accountNo,
      items: invoice.items?.length ? invoice.items : [{ description: '', quantity: 1, unitPrice: invoice.amount || '' }],
      status: invoice.status,
    });
    setQrCode(invoice.qrCode || qrCode);
    setActiveTab('create');
  }

  function shareText() {
    const itemLines = formData.items
      .filter((item) => item.description.trim())
      .map((item) => `• ${item.description} x${item.quantity || 1} — ${formatMoney(Number(item.unitPrice || 0) * Number(item.quantity || 1))}`)
      .join('\n');
    return `${my ? 'မင်္ဂလာပါ' : 'Hello'} ${formData.clientName || (my ? 'လူကြီးမင်း' : 'there')},\n${my ? 'Invoice' : 'Invoice'} ${formData.id}\n${itemLines}\n${my ? 'စုစုပေါင်း' : 'Total'}: ${formatMoney(total)}\n${my ? 'ပေးချေရမည့်ရက်' : 'Due date'}: ${formData.dueDate || '—'}\n${formData.paymentMethod}: ${formData.accountNo || '—'}\n${profile.name ? `${my ? 'ပို့သူ' : 'From'}: ${profile.name}` : ''}`.trim();
  }

  async function copyInvoiceText() {
    try {
      await navigator.clipboard.writeText(shareText());
      showToast(my ? 'Invoice စာသားကို ကူးပြီးပါပြီ။' : 'Invoice text copied.');
    } catch {
      showToast(my ? 'Clipboard မရနိုင်ပါ။ PDF ကို ဒေါင်းလုဒ်လုပ်ပါ။' : 'Clipboard unavailable. Download the PDF instead.');
    }
  }

  function shareTo(platform) {
    const text = encodeURIComponent(shareText());
    const link = platform === 'telegram'
      ? `https://t.me/share/url?url=&text=${text}`
      : `viber://forward?text=${text}`;
    window.open(link, '_blank', 'noopener,noreferrer');
  }

  function emailInvoice() {
    const recipient = formData.clientEmail.trim();
    if (!recipient) {
      showToast(my ? 'ဖောက်သည်၏ email လိပ်စာကို အရင်ဖြည့်ပါ။' : 'Enter the client email address first.');
      return;
    }
    const subject = `Invoice ${formData.id}${profile.name ? ` from ${profile.name}` : ''}`;
    window.location.assign(`mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shareText())}`);
  }

  async function downloadPdf() {
    if (!invoiceRef.current) return;
    try {
      const canvas = await html2canvas(invoiceRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const width = pdf.internal.pageSize.getWidth();
      const height = (canvas.height * width) / canvas.width;
      const image = canvas.toDataURL('image/jpeg', 0.96);
      let remainingHeight = height;
      let offset = 0;
      pdf.addImage(image, 'JPEG', 0, offset, width, height);
      remainingHeight -= pdf.internal.pageSize.getHeight();
      while (remainingHeight > 0) {
        offset = remainingHeight - height;
        pdf.addPage();
        pdf.addImage(image, 'JPEG', 0, offset, width, height);
        remainingHeight -= pdf.internal.pageSize.getHeight();
      }
      pdf.save(`${formData.id || 'paypulse-invoice'}.pdf`);
    } catch (error) {
      console.error('PDF generation failed', error);
      showToast(my ? 'PDF ဖန်တီးရာတွင် အမှားဖြစ်နေပါသည်။' : 'Could not create the PDF.');
    }
  }

  async function downloadImage() {
    if (!invoiceRef.current) return;
    try {
      const canvas = await html2canvas(invoiceRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${formData.id || 'paypulse-invoice'}.png`;
      link.click();
      showToast(my ? 'Invoice ပုံကို ဒေါင်းလုဒ်လုပ်ပြီးပါပြီ။ Telegram သို့မဟုတ် Viber ထဲတွင် ပုံအဖြစ်တွဲပို့ပါ။' : 'Invoice image downloaded. Attach it in Telegram or Viber to send it as a picture.');
    } catch (error) {
      console.error('Invoice image generation failed', error);
      showToast(my ? 'Invoice ပုံဖန်တီးရာတွင် အမှားဖြစ်နေပါသည်။' : 'Could not create the invoice image.');
    }
  }

  async function downloadBackup() {
    const data = await exportBackupData();
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `paypulse-backup-${localDateString()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast(my ? 'Backup ဖိုင် ဒေါင်းလုဒ်လုပ်ပြီးပါပြီ။' : 'Backup downloaded.');
  }

  async function restoreBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const confirmed = window.confirm(my
      ? 'Backup ထဲက ဒေတာနဲ့ ဒီစက်ထဲက Invoice အားလုံးကို အစားထိုးမလား။'
      : 'Replace all invoices and settings on this device with this backup?');
    if (!confirmed) return;
    try {
      await importBackupData(await file.text());
      setInvoices(await getAllInvoices());
      const savedProfile = await getSetting('profile');
      const savedQr = await getSetting('qrCode');
      const preferences = await getSetting('preferences');
      setProfile({ ...emptyProfile, ...(savedProfile || {}) });
      setQrCode(savedQr || '');
      if (preferences?.appLang) setAppLang(preferences.appLang);
      if (preferences?.pdfLang) setPdfLang(preferences.pdfLang);
      showToast(my ? 'Backup ပြန်လည်ထည့်သွင်းပြီးပါပြီ။' : 'Backup restored.');
    } catch (error) {
      showToast(error.message || (my ? 'Backup ဖိုင် မှားနေပါသည်။' : 'Invalid backup file.'));
    }
  }

  function openNewInvoice() {
    setFormData(newInvoiceForm(profile));
    setActiveTab('create');
  }

  function switchTab(tab) {
    setActiveTab(tab);
    if (tab === 'create') setFormData(newInvoiceForm(profile));
  }

  if (!ready) return <main className="loading-screen"><span className="brand-mark">P</span><p>PayPulse</p></main>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand-lockup" href="#home" onClick={(event) => { event.preventDefault(); switchTab('overview'); }}>
          <span className="brand-mark">P</span>
          <span><strong>PayPulse</strong><small>INVOICE STUDIO</small></span>
        </a>
        <span className="nav-label">{my ? 'လုပ်ငန်းခွင်' : 'WORKSPACE'}</span>
        <nav className="side-nav" aria-label="Main navigation">
          <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => switchTab('overview')}><LayoutDashboard size={18} />{my ? 'ခြုံငုံမြင်ကွင်း' : 'Overview'}<span className="nav-arrow">›</span></button>
          <button className={activeTab === 'history' ? 'active' : ''} onClick={() => switchTab('history')}><FileText size={18} />{my ? 'Invoice စာရင်း' : 'Invoices'}<span className="nav-count">{invoices.length}</span></button>
          <button className={activeTab === 'create' ? 'active' : ''} onClick={openNewInvoice}><Plus size={18} />{my ? 'အသစ်ဖန်တီးရန်' : 'Create invoice'}</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note"><span className="local-dot" /><span>{my ? 'ဒီစက်ထဲတွင်သာ သိမ်းဆည်းထားသည်' : 'Stored on this device only'}</span></div>
          <div className="profile-chip">
            <span className="avatar">{profile.name?.trim()?.[0]?.toUpperCase() || 'F'}</span>
            <span className="profile-copy"><strong>{profile.name || (my ? 'သင့်လုပ်ငန်း' : 'Your business')}</strong><small>{my ? 'Freelancer' : 'Solo freelancer'}</small></span>
            <Settings2 size={16} />
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>PayPulse</span><span>/</span><strong>{activeTab === 'create' ? (my ? 'Invoice အသစ်' : 'New invoice') : activeTab === 'history' ? (my ? 'Invoice စာရင်း' : 'Invoices') : (my ? 'ခြုံငုံမြင်ကွင်း' : 'Overview')}</strong></div>
          <div className="top-actions">
            <div className="language-switch" aria-label="App language">
              <Languages size={15} />
              <button className={appLang === 'my' ? 'selected' : ''} onClick={() => changeLanguage('my', 'app')}>မြန်မာ</button>
              <span />
              <button className={appLang === 'en' ? 'selected' : ''} onClick={() => changeLanguage('en', 'app')}>EN</button>
            </div>
            <button className="button button-primary button-small" onClick={openNewInvoice}><Plus size={16} />{my ? 'Invoice အသစ်' : 'New invoice'}</button>
          </div>
        </header>

        <div className="content-area">
          {activeTab !== 'create' && (
            <>
              <section className="page-heading">
                <div>
                  <p className="eyebrow">{my ? 'သင့်ငွေစာရင်း' : 'YOUR MONEY, IN MOTION'}</p>
                  <h1>{activeTab === 'history' ? (my ? 'Invoice စာရင်း' : 'Your invoices') : (my ? 'မင်္ဂလာပါ' : 'Good to see you')}{activeTab === 'overview' && profile.name ? `, ${profile.name.split(' ')[0]}` : ''}</h1>
                  <p className="heading-subtitle">{activeTab === 'history' ? (my ? 'Invoice အားလုံးကို ဒီနေရာမှာ စီမံနိုင်ပါတယ်။' : 'Manage every invoice in one place.') : (my ? 'ဒီနေ့ သင့် invoice တွေရဲ့ အခြေအနေကို ကြည့်လိုက်ပါ။' : 'Here is where your invoices stand today.')}</p>
                </div>
                <div className="heading-date"><span className="date-icon"><Activity size={17} /></span><span>{new Intl.DateTimeFormat(my ? 'en-GB' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())}</span></div>
              </section>

              {activeTab === 'overview' && (
                <section className="summary-grid" aria-label={my ? 'Invoice စုစုပေါင်းများ' : 'Invoice totals'}>
                  <article className="summary-card summary-pending"><div className="summary-top"><span>{my ? 'လက်ခံရန်ကျန်ငွေ' : 'Awaiting payment'}</span><span className="summary-icon"><Clock3 size={18} /></span></div><strong>{formatMoney(totals.Pending + totals.Overdue)}</strong><div className="summary-foot"><span className="tiny-status pending-dot" />{my ? `${invoices.filter((item) => invoiceStatus(item) !== 'Paid').length} စောင် မပေးရသေး` : `${invoices.filter((item) => invoiceStatus(item) !== 'Paid').length} unpaid invoices`}</div></article>
                  <article className="summary-card summary-paid"><div className="summary-top"><span>{my ? 'ပေးချေပြီး' : 'Collected'}</span><span className="summary-icon"><CheckCircle2 size={18} /></span></div><strong>{formatMoney(totals.Paid)}</strong><div className="summary-foot"><span className="tiny-status paid-dot" />{my ? `${invoices.filter((item) => invoiceStatus(item) === 'Paid').length} စောင် ပေးပြီး` : `${invoices.filter((item) => invoiceStatus(item) === 'Paid').length} paid invoices`}</div></article>
                  <article className="summary-card summary-overdue"><div className="summary-top"><span>{my ? 'ရက်ကျော်နေသည်' : 'Past due'}</span><span className="summary-icon"><ArrowUpRight size={18} /></span></div><strong>{formatMoney(totals.Overdue)}</strong><div className="summary-foot"><span className="tiny-status overdue-dot" />{my ? `${invoices.filter((item) => invoiceStatus(item) === 'Overdue').length} စောင် ရက်ကျော်` : `${invoices.filter((item) => invoiceStatus(item) === 'Overdue').length} overdue invoices`}</div></article>
                </section>
              )}

              <section className="invoice-panel">
                <div className="panel-header">
                  <div><h2>{my ? 'မကြာသေးမီ Invoice များ' : activeTab === 'history' ? 'All invoices' : 'Recent invoices'}</h2><p>{my ? 'အခြေအနေကို အမြန်ကြည့်ရှုပြီး စီမံပါ။' : 'A clear view of what is due and what is done.'}</p></div>
                  <div className="panel-tools">
                    <label className="search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={my ? 'ရှာဖွေရန်...' : 'Search invoices'} /></label>
                    <label className="filter-select"><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter by status"><option value="All">{my ? 'အားလုံး' : 'All status'}</option><option value="Pending">{my ? 'မပေးရသေး' : 'Pending'}</option><option value="Paid">{my ? 'ပေးပြီး' : 'Paid'}</option><option value="Overdue">{my ? 'ရက်ကျော်' : 'Overdue'}</option></select><ChevronDown size={14} /></label>
                  </div>
                </div>
                {visibleInvoices.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>{my ? 'ဖောက်သည်' : 'CLIENT'}</th><th>{my ? 'Invoice နံပါတ်' : 'INVOICE'}</th><th>{my ? 'ပေးချေရမည့်ရက်' : 'DUE DATE'}</th><th>{my ? 'အခြေအနေ' : 'STATUS'}</th><th className="amount-cell">{my ? 'ပမာဏ' : 'AMOUNT'}</th><th /></tr></thead>
                      <tbody>{visibleInvoices.map((invoice) => {
                        const status = invoiceStatus(invoice);
                        return <tr key={invoice.id}>
                          <td><span className="client-cell"><span className="client-avatar">{invoice.clientName?.[0]?.toUpperCase() || '?'}</span><span><strong>{invoice.clientName}</strong><small>{invoice.clientPhone || invoice.senderName || (my ? 'ဖုန်းနံပါတ်မရှိ' : 'No phone number')}</small></span></span></td>
                          <td><span className="invoice-id">{invoice.id}</span></td>
                          <td>{formatDate(invoice.dueDate, appLang)}</td>
                          <td><StatusBadge status={status} my={my} /></td>
                          <td className="amount-cell"><strong>{formatMoney(invoice.amount || invoiceTotal(invoice.items))}</strong></td>
                          <td><div className="row-actions"><button className="icon-button" title={status === 'Paid' ? (my ? 'မပေးရသေးဟု ပြောင်းရန်' : 'Mark pending') : (my ? 'ပေးချေပြီးဟု မှတ်ရန်' : 'Mark paid')} onClick={() => setInvoiceStatus(invoice, status === 'Paid' ? 'Pending' : 'Paid')}><CheckCircle2 size={15} /></button><button className="icon-button" title={my ? 'ကြည့်ရန် / PDF' : 'Open invoice'} onClick={() => editInvoice(invoice)}><ArrowUpRight size={16} /></button><button className="icon-button danger-hover" title={my ? 'ဖျက်ရန်' : 'Delete invoice'} onClick={() => removeInvoice(invoice)}><Trash2 size={15} /></button></div></td>
                        </tr>;
                      })}</tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state"><span className="empty-icon"><FileText size={23} /></span><h3>{query || filter !== 'All' ? (my ? 'ကိုက်ညီသော Invoice မတွေ့ပါ' : 'No matching invoices') : (my ? 'Invoice မရှိသေးပါ' : 'Your first invoice starts here')}</h3><p>{query || filter !== 'All' ? (my ? 'ရှာဖွေမှုကို ပြောင်းကြည့်ပါ။' : 'Try changing your search or filter.') : (my ? 'ပထမဆုံး invoice ကို ဖန်တီးပြီး PDF အဖြစ် မျှဝေလိုက်ပါ။' : 'Create one, add your payment QR, and share it in seconds.')}</p>{!query && filter === 'All' && <button className="button button-dark" onClick={openNewInvoice}><Plus size={16} />{my ? 'Invoice ဖန်တီးရန်' : 'Create an invoice'}</button>}</div>
                )}
                <div className="panel-footer"><span>{my ? `စုစုပေါင်း ${invoices.length} စောင်` : `${invoices.length} total invoices`}</span><button className="text-button" onClick={() => switchTab('history')}>{my ? 'စာရင်းအပြည့်ကြည့်ရန်' : 'View all'} <ArrowUpRight size={14} /></button></div>
              </section>

              <section className="bottom-strip">
                <div className="tip-icon"><WalletCards size={19} /></div><div><strong>{my ? 'ငွေလက်ခံဖို့ အသင့်ဖြစ်ပြီလား?' : 'Make paying you the easy part.'}</strong><span>{my ? 'ကိုယ်ပိုင် QR ကို တင်ထားရင် Invoice PDF ထဲမှာ အလိုအလျောက်ပါဝင်ပါမယ်။' : 'Add your payment QR once. It will appear on every invoice PDF.'}</span></div><button className="text-button" onClick={openNewInvoice}>{my ? 'Invoice ဖန်တီးရန်' : 'Create invoice'} <ArrowUpRight size={14} /></button>
              </section>
            </>
          )}

          {activeTab === 'create' && (
            <>
              <section className="page-heading create-heading"><div><p className="eyebrow">{my ? 'အချက်အလက်ဖြည့်ပြီး ချက်ချင်းမျှဝေပါ' : 'READY TO SEND IN A FEW CLICKS'}</p><h1>{my ? 'Invoice ဖန်တီးရန်' : 'Create an invoice'}</h1><p className="heading-subtitle">{my ? 'လိုအပ်တဲ့အချက်အလက်တွေ ဖြည့်ပြီး Preview မှာ စစ်ဆေးပါ။' : 'Fill in the essentials, then review the invoice before sharing.'}</p></div><button className="button button-quiet" onClick={() => switchTab('overview')}>{my ? 'ပယ်ဖျက်ရန်' : 'Cancel'}</button></section>
              <div className="builder-grid">
                <form className="builder-form" onSubmit={saveCurrentInvoice}>
                  <section className="form-section"><div className="section-title"><span className="step-number">01</span><div><h2>{my ? 'သင့်လုပ်ငန်း' : 'Your details'}</h2><p>{my ? 'Invoice ပေါ်မှာ ဖော်ပြမယ့် အချက်အလက်များ' : 'Shown at the top of the invoice'}</p></div></div>
                    <div className="field-grid"><label className="field field-span"><span>{my ? 'အမည် / Brand' : 'Name / business'}</span><input value={profile.name} onChange={(event) => updateProfile('name', event.target.value)} placeholder={my ? 'ဥပမာ - မောင်မောင် Design' : 'e.g. Aung Aung Design'} /></label>
                    <label className="field"><span>{my ? 'ဖုန်းနံပါတ်' : 'Phone number'}</span><input value={profile.phone} onChange={(event) => updateProfile('phone', event.target.value)} placeholder="09 123 456 789" /></label>
                    <label className="field"><span>{my ? 'Logo (ရွေးချယ်နိုင်)' : 'Logo (optional)'}</span><span className="upload-control"><Upload size={15} /><span>{profile.logo ? (my ? 'Logo တင်ပြီး' : 'Logo added') : (my ? 'ပုံရွေးရန်' : 'Choose image')}</span><input type="file" accept="image/*" onChange={(event) => readImage(event.target.files?.[0], async (image) => { const next = { ...profile, logo: image }; setProfile(next); await saveSetting('profile', next); })} /></span></label></div>
                  </section>

                  <section className="form-section"><div className="section-title"><span className="step-number">02</span><div><h2>{my ? 'ဖောက်သည်နှင့် အလုပ်' : 'Client & work'}</h2><p>{my ? 'ငွေတောင်းခံမယ့်သူနဲ့ လုပ်ဆောင်ချက်များ' : 'Who is paying and what for'}</p></div></div>
                    <div className="field-grid"><label className="field"><span>{my ? 'ဖောက်သည်အမည်' : 'Client name'} <i>*</i></span><input required value={formData.clientName} onChange={(event) => setFormData({ ...formData, clientName: event.target.value })} placeholder={my ? 'ဖောက်သည်အမည်' : 'Client or company'} /></label><label className="field"><span>{my ? 'ဖုန်း (ရွေးချယ်နိုင်)' : 'Phone (optional)'}</span><input value={formData.clientPhone} onChange={(event) => setFormData({ ...formData, clientPhone: event.target.value })} placeholder="09 123 456 789" /></label><label className="field field-span"><span>{my ? 'Email (ရွေးချယ်နိုင်)' : 'Email (optional)'}</span><input type="email" value={formData.clientEmail} onChange={(event) => setFormData({ ...formData, clientEmail: event.target.value })} placeholder="client@example.com" /></label></div>
                    <div className="items-heading"><span>{my ? 'အလုပ် / ဝန်ဆောင်မှု' : 'ITEMS & SERVICES'}</span><span>{my ? 'ပမာဏ (MMK)' : 'AMOUNT (MMK)'}</span></div>
                    <div className="items-list">{formData.items.map((item, index) => <div className="item-row" key={index}><label className="field item-description"><span>{index === 0 ? (my ? 'ဖော်ပြချက်' : 'Description') : `Item ${index + 1}`}</span><input value={item.description} onChange={(event) => updateItem(index, 'description', event.target.value)} placeholder={my ? 'ဥပမာ - Logo ဒီဇိုင်း' : 'e.g. Brand identity design'} /></label><label className="field item-quantity"><span>{my ? 'အရေအတွက်' : 'QTY'}</span><input type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} /></label><label className="field item-price"><span>{my ? 'တစ်ခုဈေး' : 'PRICE'}</span><input type="number" min="0" step="1" value={item.unitPrice} onChange={(event) => updateItem(index, 'unitPrice', event.target.value)} placeholder="0" /></label>{formData.items.length > 1 && <button className="remove-item" type="button" title="Remove item" onClick={() => setFormData({ ...formData, items: formData.items.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={15} /></button>}</div>)}</div>
                    <button className="add-item" type="button" onClick={() => setFormData({ ...formData, items: [...formData.items, { description: '', quantity: 1, unitPrice: '' }] })}><Plus size={15} />{my ? 'အလုပ်တစ်ခု ထပ်ထည့်ရန်' : 'Add another item'}</button>
                    <div className="total-line"><span>{my ? 'စုစုပေါင်း' : 'TOTAL DUE'}</span><strong>{formatMoney(total)}</strong></div>
                    <div className="field-grid due-grid"><label className="field"><span>{my ? 'ပေးချေရမည့်ရက်' : 'Due date'} <i>*</i></span><input type="date" required value={formData.dueDate} onChange={(event) => setFormData({ ...formData, dueDate: event.target.value })} /></label><label className="field"><span>{my ? 'Invoice နံပါတ်' : 'Invoice number'}</span><input value={formData.id} readOnly /></label></div>
                  </section>

                  <section className="form-section payment-section"><div className="section-title"><span className="step-number">03</span><div><h2>{my ? 'ငွေပေးချေမှု' : 'Payment details'}</h2><p>{my ? 'QR သို့မဟုတ် ငွေလွှဲအချက်အလက် ထည့်ပါ' : 'Add a personal QR or transfer details'}</p></div></div>
                    <div className="field-grid"><label className="field"><span>{my ? 'ငွေလက်ခံနည်း' : 'Payment method'}</span><select value={formData.paymentMethod} onChange={(event) => setFormData({ ...formData, paymentMethod: event.target.value })}><option>KBZPay</option><option>WavePay</option><option>AYA Pay</option><option>CB Pay</option></select></label><label className="field"><span>{my ? 'ဖုန်း / အကောင့်နံပါတ်' : 'Phone / account number'}</span><input value={formData.accountNo} onChange={(event) => setFormData({ ...formData, accountNo: event.target.value })} placeholder="09 123 456 789" /></label></div>
                    <label className="qr-upload"><span className="qr-upload-icon"><Upload size={17} /></span><span><strong>{qrCode ? (my ? 'QR ပုံ ထည့်ပြီးပါပြီ' : 'Payment QR added') : (my ? 'ကိုယ်ပိုင် Payment QR တင်ပါ' : 'Upload your payment QR')}</strong><small>{my ? 'KPay, Wave Pay သို့မဟုတ် AYA Pay · PNG/JPG · 3 MB အထိ' : 'KBZPay, WavePay or AYA Pay · PNG/JPG · up to 3 MB'}</small></span><span className="qr-upload-action">{qrCode ? (my ? 'ပြောင်းရန်' : 'Change') : (my ? 'ရွေးရန်' : 'Choose')}</span><input type="file" accept="image/*" onChange={(event) => readImage(event.target.files?.[0], async (image) => { setQrCode(image); await saveSetting('qrCode', image); })} /></label>
                  </section>

                  <button className="button button-primary save-button" type="submit"><Check size={17} />{my ? 'Invoice သိမ်းဆည်းရန်' : 'Save invoice'}<span>{formatMoney(total)}</span></button>
                </form>

                <aside className="preview-column"><div className="preview-toolbar"><div><span className="preview-dot" /><strong>{my ? 'အကြိုကြည့်ရှုမှု' : 'LIVE PREVIEW'}</strong></div><div className="language-switch pdf-switch"><span>{my ? 'Invoice ဘာသာ' : 'PDF language'}</span><button className={pdfLang === 'my' ? 'selected' : ''} onClick={() => changeLanguage('my', 'pdf')}>မြန်မာ</button><button className={pdfLang === 'en' ? 'selected' : ''} onClick={() => changeLanguage('en', 'pdf')}>EN</button></div></div>
                  <div className="invoice-paper" ref={invoiceRef}>
                    <div className="paper-topline"><span>{pdfLang === 'my' ? 'ငွေတောင်းခံလွှာ' : 'INVOICE'}</span><span className="paper-number">{formData.id}</span></div>
                    <div className="paper-brand">{profile.logo ? <Image src={profile.logo} alt="Business logo" width={43} height={38} unoptimized /> : <span className="paper-brand-mark">{profile.name?.[0]?.toUpperCase() || 'P'}</span>}<div><strong>{profile.name || (pdfLang === 'my' ? 'သင့်လုပ်ငန်းအမည်' : 'Your business name')}</strong><span>{profile.phone || (pdfLang === 'my' ? 'ဖုန်းနံပါတ်' : 'Phone number')}</span></div></div>
                    <div className="paper-meta"><div><span>{pdfLang === 'my' ? 'ငွေပေးချေသူ' : 'BILL TO'}</span><strong>{formData.clientName || (pdfLang === 'my' ? 'ဖောက်သည်အမည်' : 'Client name')}</strong>{formData.clientPhone && <small>{formData.clientPhone}</small>}</div><div><span>{pdfLang === 'my' ? 'ပေးချေရမည့်ရက်' : 'DUE DATE'}</span><strong>{formatDate(formData.dueDate, pdfLang)}</strong></div></div>
                    <div className="paper-items"><div className="paper-items-head"><span>{pdfLang === 'my' ? 'အကြောင်းအရာ' : 'DESCRIPTION'}</span><span>{pdfLang === 'my' ? 'ပမာဏ' : 'AMOUNT'}</span></div>{formData.items.map((item, index) => <div className="paper-item" key={index}><span>{item.description || (pdfLang === 'my' ? 'အလုပ် / ဝန်ဆောင်မှု' : 'Work or service')}<small>{item.quantity || 1} × {formatMoney(item.unitPrice)}</small></span><strong>{formatMoney(Number(item.unitPrice || 0) * Number(item.quantity || 0))}</strong></div>)}</div>
                    <div className="paper-total"><span>{pdfLang === 'my' ? 'စုစုပေါင်းကျသင့်ငွေ' : 'TOTAL DUE'}</span><strong>{formatMoney(total)}</strong><small>{pdfLang === 'my' ? 'မြန်မာကျပ်' : 'Myanmar Kyat'}</small></div>
                    <div className="paper-payment"><div><strong>{pdfLang === 'my' ? 'ငွေပေးချေရန်' : 'PAYMENT DETAILS'}</strong><span>{formData.paymentMethod} · {formData.accountNo || (pdfLang === 'my' ? 'အကောင့်နံပါတ်' : 'Account number')}</span></div>{qrCode ? <Image src={qrCode} alt="Payment QR code" width={47} height={47} unoptimized /> : <span className="qr-placeholder"><WalletCards size={21} />{pdfLang === 'my' ? 'QR ထည့်နိုင်သည်' : 'Add QR code'}</span>}</div>
                    <div className="paper-thanks">{pdfLang === 'my' ? 'ယုံကြည်စွာ အပ်နှံမှုအတွက် ကျေးဇူးတင်ပါသည်။' : 'Thank you for your business.'}</div>
                  </div>
                  <div className="share-actions"><button className="button button-dark" onClick={downloadPdf}><ArrowDownToLine size={16} />{my ? 'PDF ဒေါင်းလုဒ်' : 'Download PDF'}</button><button className="button button-dark image-download-button" onClick={downloadImage}><ImageDown size={16} />{my ? 'ပုံဒေါင်းလုဒ်' : 'Download Image'}</button><button className="share-button telegram" onClick={() => shareTo('telegram')}><Share2 size={15} />Telegram</button><button className="share-button viber" onClick={() => shareTo('viber')}><Share2 size={15} />Viber</button><button className="share-button email-button" onClick={emailInvoice}><Mail size={15} />Email</button><button className="share-button copy-button" onClick={copyInvoiceText} title={my ? 'Invoice စာသားကူးရန်' : 'Copy invoice text'}><Copy size={15} /></button></div>
                  <p className="share-hint">{my ? 'ဒီ app ကနေ Telegram/Viber ထဲကို တန်းဝင်ပြီး တိုက်ရိုက်ပို့လို့မရပါ။ ပုံကို အရင်ဒေါင်းလုဒ်လုပ်ပါ။ ပြီးရင် ကိုယ့် Telegram/Viber app ကို ကိုယ်တိုင်ဖွင့်ပြီး ပို့မယ့် chat ထဲမှာ ပုံကိုတွဲပို့ပါ။' : 'You cannot open Telegram or Viber and send directly from this app. Download the image first, then open Telegram or Viber yourself and attach it in the chat you want to send it to.'}</p>
                </aside>
              </div>
            </>
          )}

          <section className="utility-footer"><span><span className="local-dot" />{my ? 'သင့်ဒေတာများကို ဒီ browser ထဲတွင်သာ သိမ်းထားသည်' : 'Your data stays in this browser'}</span><div><button onClick={downloadBackup}><ArrowDownToLine size={14} />{my ? 'Backup ထုတ်ရန်' : 'Backup'}</button><button onClick={() => restoreRef.current?.click()}><Upload size={14} />{my ? 'ပြန်သွင်းရန်' : 'Restore'}</button><input ref={restoreRef} type="file" accept="application/json,.json" onChange={restoreBackup} hidden /></div></section>
        </div>
      </main>
      {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
    </div>
  );
}