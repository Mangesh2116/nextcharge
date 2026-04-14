import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

const STATIONS = [
  { _id: 's1', icon: '⚡', name: 'Tata Power EV Hub — BKC', address: 'Bandra Kurla Complex, Mumbai', distance: '0.8 km', portsOpen: '6/8', maxSpeed: '150 kW', price: '₹15/kWh', connectors: ['CCS2', 'CHAdeMO', 'Type 2 AC'], status: 'available', lat: 19.0596, lng: 72.8656, mapPos: { left: '28%', top: '33%' } },
  { _id: 's2', icon: '🔋', name: 'Ather Grid — Andheri West', address: 'Andheri West, Mumbai', distance: '2.1 km', portsOpen: '4/4', maxSpeed: '7.2 kW', price: '₹8/kWh', connectors: ['Ather', 'Type 2 AC'], status: 'available', lat: 19.1224, lng: 72.8264, mapPos: { left: '58%', top: '33%' } },
  { _id: 's3', icon: '🏢', name: 'BPCL Pulse — Powai', address: 'Powai, Mumbai', distance: '3.5 km', portsOpen: '2/6', maxSpeed: '60 kW', price: '₹12/kWh', connectors: ['CCS2', 'Type 2 AC', 'Bharat DC'], status: 'busy', lat: 19.1197, lng: 72.9081, mapPos: { left: '44%', top: '63%' } },
  { _id: 's4', icon: '⚡', name: 'ChargeZone — Worli', address: 'Worli, Mumbai', distance: '4.2 km', portsOpen: '3/3', maxSpeed: '30 kW', price: '₹10/kWh', connectors: ['CCS2', 'CHAdeMO'], status: 'available', lat: 19.0096, lng: 72.8178, mapPos: { left: '19%', top: '63%' } },
  { _id: 's5', icon: '🛣️', name: 'MG ZS Hub — Malad', address: 'Malad West, Mumbai', distance: '5.8 km', portsOpen: '8/10', maxSpeed: '50 kW', price: '₹13/kWh', connectors: ['CCS2', 'Type 2 AC', 'GB/T'], status: 'available', lat: 19.1875, lng: 72.8479, mapPos: { left: '74%', top: '58%' } },
  { _id: 's6', icon: '🏪', name: 'Reliance BP — Navi Mumbai', address: 'Vashi, Navi Mumbai', distance: '8.1 km', portsOpen: '12/12', maxSpeed: '240 kW', price: '₹18/kWh', connectors: ['CCS2', 'CHAdeMO', 'Type 2 AC'], status: 'available', lat: 19.0771, lng: 73.0071, mapPos: null },
];
const STATS = [{ num: '4,200+', label: 'Charging Points' }, { num: '120+', label: 'Cities Covered' }, { num: '98.2%', label: 'Uptime Rate' }, { num: '50,000+', label: 'Charges This Month' }];
const HOW_STEPS = [{ num: '01', icon: '🔍', title: 'Find your station', desc: 'Search by location or let us detect where you are and show nearby stations with live availability.' }, { num: '02', icon: '📅', title: 'Book your slot', desc: 'Reserve a charging port in advance — pick your date, time, and connector type. Cancel anytime for free.' }, { num: '03', icon: '⚡', title: 'Arrive & charge', desc: 'Scan the QR code or use the app to start charging. Pay automatically when your session ends.' }, { num: '04', icon: '📊', title: 'Track your usage', desc: 'View session history, kWh charged, money spent, and carbon saved — all in your NextCharge dashboard.' }];
const CONNECTOR_TYPES = ['CCS2 (DC Fast — 150kW)', 'CHAdeMO (DC Fast)', 'Type 2 AC (7.2kW)', 'Bharat DC-001'];
const FILTER_TABS = ['All', 'Fast DC', 'AC', 'CCS2'];

const API_BASE = 'https://nextcharge.onrender.com/api/v1';
async function apiCall(endpoint, opts = {}, token = null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(API_BASE + endpoint, { method: opts.method || 'GET', headers, signal: controller.signal, ...(opts.body && { body: JSON.stringify(opts.body) }) });
    clearTimeout(timeout);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || ('Error ' + res.status));
    return { ok: true, data: json };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, error: err.name === 'AbortError' ? 'Request timed out' : err.message };
  }
}

const Ctx = createContext(null);
const useApp = () => useContext(Ctx);

function AppProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('nc_user')); } catch { return null; } });
  const [token, setToken] = useState(() => localStorage.getItem('nc_token') || null);
  const [toasts, setToasts] = useState([]);
  const [authModal, setAuthModal] = useState(null);
  const [bookingModal, setBookingModal] = useState(false);
  const [selectedStation, setSelectedStation] = useState(null);
  const [backendOnline, setBackendOnline] = useState(null);

  useEffect(() => { apiCall('/stations?limit=1').then(r => setBackendOnline(r.ok)); }, []);

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800);
  }, []);

  const login = useCallback(async (emailOrPhone, password) => {
    const r = await apiCall('/auth/login', { method: 'POST', body: { emailOrPhone, password } });
    if (!r.ok) throw new Error(r.error || 'Invalid credentials');
    const tok = r.data.token; const u = r.data.user;
    localStorage.setItem('nc_token', tok); localStorage.setItem('nc_user', JSON.stringify(u));
    setToken(tok); setUser(u); return u;
  }, []);

  const signup = useCallback(async (payload) => {
    const r = await apiCall('/auth/register', { method: 'POST', body: payload });
    if (!r.ok) throw new Error(r.error || 'Registration failed');
    const tok = r.data.token; const u = r.data.user;
    localStorage.setItem('nc_token', tok); localStorage.setItem('nc_user', JSON.stringify(u));
    setToken(tok); setUser(u); return u;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('nc_token'); localStorage.removeItem('nc_user');
    setToken(null); setUser(null); showToast('Signed out. See you soon!', 'info');
  }, [showToast]);

  const createBooking = useCallback(async (payload) => {
    if (!token) throw new Error('Not authenticated');
    const r = await apiCall('/bookings', { method: 'POST', body: payload }, token);
    if (!r.ok) throw new Error(r.error || 'Booking failed');
    return r.data;
  }, [token]);

  const searchStations = useCallback(async (query) => {
    const ep = query ? '/stations?search=' + encodeURIComponent(query) : '/stations';
    const r = await apiCall(ep);
    return r.ok ? (r.data.data || []) : null;
  }, []);

  return (
    <Ctx.Provider value={{ user, token, toasts, showToast, authModal, setAuthModal, bookingModal, setBookingModal, selectedStation, setSelectedStation, backendOnline, login, signup, logout, createBooking, searchStations }}>
      {children}
    </Ctx.Provider>
  );
}

const G = '#00E676'; const BG = '#060A0F'; const BG2 = '#0C1219'; const SURFACE = '#161E28';
const BORDER = 'rgba(255,255,255,0.07)'; const BORDER_G = 'rgba(0,230,118,0.2)';
const TEXT = '#F0F4F8'; const MUTED = '#7A8EA0';
const CLASH = "'Clash Display', sans-serif"; const SATOSHI = "'Satoshi', sans-serif";
const btnStyle = (v, e = {}) => ({ fontFamily: SATOSHI, fontWeight: 700, cursor: 'pointer', border: 'none', borderRadius: 50, fontSize: '0.9rem', transition: 'all 0.15s', padding: '0.65rem 1.4rem', ...(v === 'primary' && { background: G, color: BG }), ...(v === 'outline' && { background: 'transparent', color: G, border: '1px solid ' + G }), ...(v === 'ghost' && { background: 'transparent', color: TEXT, border: '1px solid ' + BORDER }), ...e });
const inpStyle = { width: '100%', background: BG2, border: '1px solid ' + BORDER, borderRadius: 12, padding: '0.75rem 1rem', color: TEXT, fontFamily: SATOSHI, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' };
const secStyle = (bg) => ({ padding: '6rem 5%', background: bg || BG });
const tagStyle = { color: G, fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1rem' };
const h2Style = { fontFamily: CLASH, fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, letterSpacing: '-0.02em', color: TEXT, marginBottom: '1rem' };
const subStyle = { color: MUTED, lineHeight: 1.7 };

function Spin({ s = 16, l = false }) {
  return <div style={{ width: s, height: s, border: '2px solid ' + (l ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'), borderTopColor: l ? TEXT : BG, borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />;
}

function Toasts() {
  const { toasts } = useApp();
  const colors = { success: G, error: '#F44336', info: '#378ADD', warning: '#FF9800' };
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  return (
    <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360 }}>
      {toasts.map(t => (
        <div key={t.id} style={{ background: SURFACE, borderLeft: '3px solid ' + (colors[t.type] || G), border: '1px solid ' + BORDER, borderLeftColor: colors[t.type] || G, color: TEXT, padding: '13px 16px', borderRadius: 12, fontFamily: SATOSHI, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 10, animation: 'slideUp 0.25s ease', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          <span style={{ color: colors[t.type] || G, fontWeight: 700, flexShrink: 0 }}>{icons[t.type] || '✓'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

function Navbar() {
  const { user, setAuthModal, logout, backendOnline } = useApp();
  const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  const navButtonStyle = {
    background: 'none',
    border: 'none',
    color: MUTED,
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: SATOSHI,
    padding: 0
  };
  return (
    <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 5%', background: 'rgba(6,10,15,0.9)', backdropFilter: 'blur(18px)', borderBottom: '1px solid ' + BORDER }}>
      <div style={{ fontFamily: CLASH, fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
        Next<span style={{ color: G }}>Charge</span>
        {backendOnline !== null && <span title={backendOnline ? 'Backend connected' : 'Demo mode — backend offline'} style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: backendOnline ? G : '#FF9800', marginLeft: 8, verticalAlign: 'middle' }} />}
      </div>
      <ul style={{ display: 'flex', gap: '2rem', listStyle: 'none', margin: 0, padding: 0 }}>
        {[['find', 'Find Stations'], ['booking', 'Book Slot'], ['how', 'How it works'], ['app', 'App']].map(([id, label]) => (
          <li key={id}><button type="button" onClick={() => scrollTo(id)} style={navButtonStyle}>{label}</button></li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,230,118,0.08)', border: '1px solid ' + BORDER_G, borderRadius: 50, padding: '0.4rem 1rem' }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,230,118,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: G }}>{user.name?.[0] || 'U'}</div>
            <span style={{ color: G, fontWeight: 600, fontSize: '0.85rem' }}>{user.name?.split(' ')[0]}</span>
            <button onClick={logout} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: '0.78rem', fontFamily: SATOSHI }}>Sign out</button>
          </div>
        ) : (
          <>
            <button style={btnStyle('primary', { fontSize: '0.85rem', padding: '0.6rem 1.4rem' })} onClick={() => setAuthModal('login')}>Login</button>
            <button style={btnStyle('outline', { fontSize: '0.85rem', padding: '0.6rem 1.4rem' })} onClick={() => setAuthModal('signup')}>Sign Up</button>
          </>
        )}
      </div>
    </nav>
  );
}

function Hero() {
  const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  return (
    <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '8rem 5% 5rem', position: 'relative', overflow: 'hidden', background: BG }}>
      <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 600, background: 'radial-gradient(circle,rgba(0,230,118,0.12) 0%,transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,230,118,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,230,118,0.04) 1px,transparent 1px)', backgroundSize: '60px 60px', WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%,black 30%,transparent 100%)', maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%,black 30%,transparent 100%)' }} />
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid ' + BORDER_G, background: 'rgba(0,230,118,0.07)', borderRadius: 50, padding: '0.4rem 1rem', fontSize: '0.8rem', color: G, marginBottom: '2rem', fontWeight: 500, position: 'relative', zIndex: 1 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: G, animation: 'pulse 2s infinite' }} /> India's Fastest-Growing EV Network
      </div>
      <h1 style={{ fontFamily: CLASH, fontSize: 'clamp(2.8rem,7vw,5.5rem)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.03em', maxWidth: 850, marginBottom: '1.5rem', position: 'relative', zIndex: 1, color: TEXT }}>
        Charge Smarter,<br />Drive <span style={{ color: G }}>Further</span>
      </h1>
      <p style={{ ...subStyle, fontSize: 'clamp(1rem,2vw,1.2rem)', maxWidth: 560, marginBottom: '2.5rem', position: 'relative', zIndex: 1 }}>Find, book, and charge at thousands of EV stations across India. Real-time availability. Zero wait time.</p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
        <button style={btnStyle('primary', { padding: '0.85rem 2rem', fontSize: '1rem' })} onClick={() => scrollTo('find')}>Find a Station</button>
        <button style={btnStyle('ghost', { padding: '0.85rem 2rem', fontSize: '1rem' })} onClick={() => scrollTo('booking')}>Book a Slot</button>
      </div>
    </section>
  );
}

function StatsBar() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', borderTop: '1px solid ' + BORDER, borderBottom: '1px solid ' + BORDER, background: BG2 }}>
      {STATS.map((s, i) => (
        <div key={i} style={{ padding: '1.8rem 3rem', textAlign: 'center', borderRight: i < STATS.length - 1 ? '1px solid ' + BORDER : 'none', flex: 1, minWidth: 140 }}>
          <span style={{ fontFamily: CLASH, fontSize: '2rem', fontWeight: 700, color: G, display: 'block' }}>{s.num}</span>
          <div style={{ fontSize: '0.8rem', color: MUTED, marginTop: 4 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function MapSection({ onSearch }) {
  const { setSelectedStation, setBookingModal, user, setAuthModal } = useApp();
  const [query, setQuery] = useState('');
  const [activePin, setActivePin] = useState(STATIONS[0]);
  const handleBook = () => { if (!user) { setAuthModal('login'); return; } setSelectedStation(activePin); setBookingModal(true); };
  return (
    <section id="find" style={{ ...secStyle(BG2), textAlign: 'center' }}>
      <div style={tagStyle}>Find Stations</div>
      <h2 style={h2Style}>Stations Near You</h2>
      <p style={{ ...subStyle, maxWidth: 500, margin: '0 auto 3rem' }}>Search by city, locality, or pin code to discover compatible charging stations in seconds.</p>
      <div style={{ display: 'flex', maxWidth: 640, margin: '0 auto 2rem', background: SURFACE, border: '1px solid ' + BORDER, borderRadius: 60, padding: '0.4rem 0.4rem 0.4rem 1.5rem', alignItems: 'center', gap: '1rem' }}>
        <span>📍</span>
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSearch(query)} placeholder="Enter city, locality, or pin code..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: TEXT, fontFamily: SATOSHI, fontSize: '0.95rem' }} />
        <button onClick={() => onSearch(query)} style={btnStyle('primary', { padding: '0.7rem 1.5rem', borderRadius: 50 })}>Search</button>
      </div>
      <div style={{ maxWidth: 900, margin: '0 auto', background: SURFACE, border: '1px solid ' + BORDER, borderRadius: 20, overflow: 'hidden', position: 'relative', height: 440 }}>
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#0C1A2E 0%,#0D1F1A 50%,#0A1E10 100%)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,230,118,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(0,230,118,0.06) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
          {[{t:'h',v:'35%'},{t:'h',v:'65%'},{t:'v',v:'30%'},{t:'v',v:'60%'}].map((r,i) => <div key={i} style={{ position: 'absolute', background: 'rgba(255,255,255,0.08)', ...(r.t==='h' ? {height:3,left:0,right:0,top:r.v}:{width:3,top:0,bottom:0,left:r.v}) }} />)}
          {STATIONS.filter(s => s.mapPos).map(s => {
            const pc = s.status === 'available' ? G : s.status === 'busy' ? '#FF9800' : '#F44336';
            return (
              <div key={s._id} onClick={() => setActivePin(s)} title={s.name} style={{ position: 'absolute', transform: 'translate(-50%,-100%)', cursor: 'pointer', ...s.mapPos }}>
                <div style={{ background: pc, width: 36, height: 36, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)' + (activePin._id === s._id ? ' scale(1.2)' : ''), display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px ' + pc + '80', transition: 'transform 0.2s' }}>
                  <span style={{ transform: 'rotate(45deg)', fontSize: 16 }}>⚡</span>
                </div>
              </div>
            );
          })}
          <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'rgba(6,10,15,0.92)', border: '1px solid ' + BORDER, borderRadius: 12, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[[G,'Available'],['#FF9800','Busy'],['#F44336','Offline']].map(([c,l]) => <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: MUTED }}><div style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />{l}</div>)}
          </div>
          {activePin && (
            <div style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(6,10,15,0.96)', border: '1px solid ' + BORDER_G, borderRadius: 16, padding: 16, width: 220 }}>
              <div style={{ fontFamily: CLASH, fontSize: '0.95rem', fontWeight: 600, marginBottom: 4 }}>{activePin.name}</div>
              <div style={{ fontSize: '0.78rem', color: MUTED, marginBottom: 12 }}>📍 {activePin.distance} · {activePin.address}</div>
              {[['Available slots', activePin.portsOpen],['Max speed', activePin.maxSpeed],['Price', activePin.price]].map(([k,v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 6 }}><span style={{ color: MUTED }}>{k}</span><span style={{ color: G, fontWeight: 500 }}>{v}</span></div>)}
              <button onClick={handleBook} style={btnStyle('primary', { width: '100%', marginTop: 12, padding: '0.6rem', fontSize: '0.8rem' })}>Book Now</button>
            </div>
          )}
          <button style={{ position: 'absolute', bottom: 16, right: 16, background: 'rgba(6,10,15,0.9)', border: '1px solid ' + BORDER, color: TEXT, width: 42, height: 42, borderRadius: '50%', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⊕</button>
        </div>
      </div>
    </section>
  );
}

function StationCard({ station }) {
  const { setSelectedStation, setBookingModal, user, setAuthModal } = useApp();
  const [hov, setHov] = useState(false);
  const isAvail = station.status === 'available';
  const handleBook = () => { if (!user) { setAuthModal('login'); return; } setSelectedStation(station); setBookingModal(true); };
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ background: SURFACE, border: '1px solid ' + (hov ? BORDER_G : BORDER), borderRadius: 20, padding: '1.5rem', transition: 'border-color 0.2s,transform 0.2s', transform: hov ? 'translateY(-3px)' : 'translateY(0)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div style={{ width: 44, height: 44, background: 'rgba(0,230,118,0.1)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>{station.icon}</div>
        <span style={{ padding: '0.25rem 0.7rem', borderRadius: 50, fontSize: '0.72rem', fontWeight: 700, background: isAvail ? 'rgba(0,230,118,0.12)' : 'rgba(255,152,0,0.12)', color: isAvail ? G : '#FF9800' }}>{isAvail ? 'Available' : 'Busy'}</span>
      </div>
      <div style={{ fontFamily: CLASH, fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.3rem' }}>{station.name}</div>
      <div style={{ fontSize: '0.82rem', color: MUTED, marginBottom: '1.2rem' }}>📍 {station.address} · {station.distance}</div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.2rem' }}>
        {[['portsOpen','Ports open'],['maxSpeed','Max speed'],['price','Price']].map(([k,l]) => <div key={k} style={{ fontSize: '0.8rem', color: MUTED }}><strong style={{ color: TEXT, display: 'block', fontSize: '0.9rem' }}>{station[k]}</strong>{l}</div>)}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.3rem', flexWrap: 'wrap' }}>
        {station.connectors.map(c => <span key={c} style={{ padding: '0.25rem 0.6rem', border: '1px solid ' + BORDER, borderRadius: 6, fontSize: '0.72rem', color: MUTED }}>{c}</span>)}
      </div>
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button onClick={handleBook} style={btnStyle('primary', { flex: 1, padding: '0.7rem', fontSize: '0.85rem' })}>Book Slot</button>
        <button onClick={() => station.lat && window.open('https://www.google.com/maps/dir/?api=1&destination=' + station.lat + ',' + station.lng, '_blank')} style={btnStyle('ghost', { padding: '0.7rem 1rem', fontSize: '0.85rem' })}>Navigate</button>
      </div>
    </div>
  );
}

function StationsSection({ apiStations, loading }) {
  const [activeTab, setActiveTab] = useState('All');
  const base = apiStations.length ? apiStations : STATIONS;
  const filtered = activeTab === 'All' ? base : base.filter(s => ({ 'Fast DC': s => s.connectors.some(c => c.includes('CCS') || c.includes('CHAde')), 'AC': s => s.connectors.some(c => c.includes('AC') || c.includes('Type 2')), 'CCS2': s => s.connectors.some(c => c.includes('CCS2')) }[activeTab]?.(s)));
  return (
    <section id="stations" style={secStyle(BG)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div><div style={tagStyle}>Nearby</div><h2 style={{ ...h2Style, marginBottom: 0 }}>Available Stations</h2></div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {FILTER_TABS.map(t => <button key={t} onClick={() => setActiveTab(t)} style={btnStyle(activeTab === t ? 'primary' : 'ghost', { fontSize: '0.82rem', padding: '0.45rem 1rem', fontWeight: activeTab === t ? 700 : 400 })}>{t}</button>)}
        </div>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: MUTED, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <Spin s={32} l /><p>Loading stations...</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: '1.2rem' }}>
          {filtered.map(s => <StationCard key={s._id} station={s} />)}
        </div>
      )}
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" style={{ ...secStyle(BG2), textAlign: 'center' }}>
      <div style={tagStyle}>How It Works</div>
      <h2 style={h2Style}>Charge in 3 Simple Steps</h2>
      <p style={{ ...subStyle, maxWidth: 500, margin: '0 auto 3rem' }}>No surprises, no waiting. Just plug in and power up.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '1.5rem', maxWidth: 900, margin: '0 auto' }}>
        {HOW_STEPS.map(s => (
          <div key={s.num} style={{ background: SURFACE, border: '1px solid ' + BORDER, borderRadius: 20, padding: '2rem 1.5rem', position: 'relative', textAlign: 'left' }}>
            <div style={{ fontFamily: CLASH, fontSize: '3rem', fontWeight: 700, color: 'rgba(0,230,118,0.12)', position: 'absolute', top: '1rem', right: '1.2rem', lineHeight: 1 }}>{s.num}</div>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>{s.icon}</div>
            <div style={{ fontFamily: CLASH, fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{s.title}</div>
            <div style={{ fontSize: '0.85rem', color: MUTED, lineHeight: 1.6 }}>{s.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BookingSection() {
  const { user, setAuthModal, setBookingModal, setSelectedStation } = useApp();
  const [form, setForm] = useState({ station: STATIONS[0].name, connector: CONNECTOR_TYPES[0], vehicle: '', date: '', time: '10:00', duration: '2 hours' });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const handleConfirm = () => { if (!user) { setAuthModal('login'); return; } setSelectedStation(STATIONS.find(s => s.name === form.station) || STATIONS[0]); setBookingModal(true); };
  return (
    <section id="booking" style={secStyle(BG)}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '4rem', alignItems: 'center', maxWidth: 1100, margin: '0 auto' }}>
        <div>
          <div style={tagStyle}>Reserve Now</div>
          <h2 style={h2Style}>Book Your<br />Charging Slot</h2>
          <p style={{ ...subStyle, marginBottom: '2.5rem', maxWidth: 420 }}>Pick a station, choose your time, and arrive knowing a port is waiting. Bookings can be made up to 7 days in advance.</p>
          {[['✅','Free cancellation','Cancel up to 30 minutes before your slot, no charge.'],['🔒','Guaranteed port','Your slot is reserved and cannot be taken by walk-ins.'],['💳','Pay after charging','UPI, card, or NextCharge wallet — billed only on completion.']].map(([icon,title,desc]) => (
            <div key={title} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.2rem' }}>
              <div style={{ width: 40, height: 40, background: 'rgba(0,230,118,0.1)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
              <div><div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 2 }}>{title}</div><div style={{ fontSize: '0.82rem', color: MUTED }}>{desc}</div></div>
            </div>
          ))}
        </div>
        <div style={{ background: SURFACE, border: '1px solid ' + BORDER_G, borderRadius: 24, padding: '2.5rem' }}>
          <div style={{ fontFamily: CLASH, fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.4rem' }}>Reserve a Slot</div>
          <div style={{ color: MUTED, fontSize: '0.85rem', marginBottom: '2rem' }}>Fill in the details to secure your charging time</div>
          {[['Station', <select value={form.station} onChange={set('station')} style={inpStyle}>{STATIONS.map(s=><option key={s._id}>{s.name}</option>)}</select>],['Connector Type', <select value={form.connector} onChange={set('connector')} style={inpStyle}>{CONNECTOR_TYPES.map(c=><option key={c}>{c}</option>)}</select>],['Vehicle', <input value={form.vehicle} onChange={set('vehicle')} placeholder="e.g. Tata Nexon EV" style={inpStyle} />],['Date & Time', <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.8rem'}}><input type="date" value={form.date} onChange={set('date')} style={inpStyle}/><input type="time" value={form.time} onChange={set('time')} style={inpStyle}/></div>],['Duration', <select value={form.duration} onChange={set('duration')} style={inpStyle}>{['30 minutes','1 hour','1.5 hours','2 hours','3 hours'].map(d=><option key={d}>{d}</option>)}</select>]].map(([label, field]) => (
            <div key={label} style={{ marginBottom: '1.2rem' }}><label style={{ fontSize: '0.8rem', color: MUTED, marginBottom: '0.4rem', display: 'block', fontWeight: 500 }}>{label}</label>{field}</div>
          ))}
          <button onClick={handleConfirm} style={btnStyle('primary', { width: '100%', padding: '1rem', fontSize: '1rem', marginTop: '0.5rem' })}>⚡ Confirm Booking</button>
        </div>
      </div>
    </section>
  );
}

function AppSection() {
  return (
    <section id="app" style={{ ...secStyle(BG2), textAlign: 'center', borderTop: '1px solid ' + BORDER, borderBottom: '1px solid ' + BORDER }}>
      <div style={tagStyle}>Mobile App</div>
      <h2 style={h2Style}>Take NextCharge Everywhere</h2>
      <p style={{ ...subStyle, maxWidth: 480, margin: '0.5rem auto 0' }}>Live charging status, navigation, QR scan to start, and instant receipts — all in your pocket.</p>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem', flexWrap: 'wrap' }}>
        {[['🍎','Download on the','App Store'],['▶','Get it on','Google Play']].map(([icon,sub,store]) => (
          <div key={store} style={{ display: 'flex', alignItems: 'center', gap: 12, background: SURFACE, border: '1px solid ' + BORDER, borderRadius: 14, padding: '0.8rem 1.5rem', cursor: 'pointer' }}>
            <div style={{ fontSize: '1.8rem' }}>{icon}</div>
            <div><small style={{ display: 'block', fontSize: '0.7rem', color: MUTED }}>{sub}</small><strong style={{ fontSize: '0.95rem' }}>{store}</strong></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ padding: '4rem 5% 2rem', background: BG, borderTop: '1px solid ' + BORDER }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '3rem', marginBottom: '3rem' }}>
        <div>
          <div style={{ fontFamily: CLASH, fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>Next<span style={{ color: G }}>Charge</span></div>
          <p style={{ color: MUTED, fontSize: '0.85rem', lineHeight: 1.7 }}>India's most reliable EV charging network. Find, book, and charge with confidence.</p>
        </div>
        {[['Network',['Find Stations','Add a Station','Station Partners','Network Map']],['Company',['About Us','Careers','Blog','Press']],['Support',['Help Center','Contact Us','Privacy Policy','Terms']]].map(([title,links]) => (
          <div key={title}><div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '1rem' }}>{title}</div><ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>{links.map(l=><li key={l}><button type="button" style={{ background: 'none', border: 'none', color: MUTED, textDecoration: 'none', fontSize: '0.85rem', fontFamily: SATOSHI, padding: 0, cursor: 'default', textAlign: 'left' }}>{l}</button></li>)}</ul></div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid ' + BORDER, paddingTop: '2rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <p style={{ fontSize: '0.8rem', color: MUTED }}>© 2024 NextCharge Technologies Pvt. Ltd. · nextcharge.in</p>
        <p style={{ fontSize: '0.8rem', color: MUTED }}>Made in India 🇮🇳</p>
      </div>
    </footer>
  );
}

function AuthModal() {
  const { authModal, setAuthModal, login, signup, showToast } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ emailOrPhone: '', password: '', name: '', email: '', phone: '' });
  useEffect(() => { setError(''); setForm({ emailOrPhone: '', password: '', name: '', email: '', phone: '' }); }, [authModal]);
  if (!authModal) return null;
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleLogin = async e => {
    e.preventDefault(); setError('');
    if (!form.emailOrPhone || !form.password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    try { await login(form.emailOrPhone, form.password); showToast('Welcome back! 👋'); setAuthModal(null); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const handleSignup = async e => {
    e.preventDefault(); setError('');
    if (!form.name || !form.email || !form.phone || !form.password) { setError('Please fill in all fields.'); return; }
    if (!/^[6-9]\d{9}$/.test(form.phone)) { setError('Enter a valid 10-digit Indian mobile number.'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try { await signup({ name: form.name, email: form.email, phone: form.phone, password: form.password }); showToast('Account created! Welcome 🎉'); setAuthModal(null); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.15s ease' }} onClick={e => e.target === e.currentTarget && setAuthModal(null)}>
      <div style={{ background: '#111820', border: '1px solid ' + BORDER_G, borderRadius: 20, padding: '2rem', width: 380, maxWidth: '94vw', animation: 'slideUp 0.25s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: CLASH, fontSize: '1.4rem', color: G, margin: 0 }}>{authModal === 'login' ? 'Sign In' : 'Create Account'}</h2>
          <button onClick={() => setAuthModal(null)} style={{ background: 'none', border: 'none', color: MUTED, fontSize: '1.3rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        {authModal === 'login' ? (
          <form onSubmit={handleLogin}>
            <input value={form.emailOrPhone} onChange={set('emailOrPhone')} placeholder="Email or phone number" style={{ ...inpStyle, marginBottom: '0.8rem' }} autoComplete="username" />
            <input type="password" value={form.password} onChange={set('password')} placeholder="Password" style={{ ...inpStyle, marginBottom: error ? '0.5rem' : '1rem' }} autoComplete="current-password" />
            {error && <div style={{ color: '#F44336', fontSize: '0.82rem', marginBottom: '0.8rem', lineHeight: 1.4 }}>{error}</div>}
            <button type="submit" disabled={loading} style={btnStyle('primary', { width: '100%', padding: '0.85rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.7 : 1 })}>
              {loading && <Spin s={14} />}{loading ? 'Signing in...' : 'Sign In'}
            </button>
            <p style={{ textAlign: 'center', fontSize: '0.85rem', color: MUTED, marginTop: '1rem' }}>Don't have an account? <span onClick={() => setAuthModal('signup')} style={{ color: G, cursor: 'pointer', fontWeight: 600 }}>Sign up</span></p>
          </form>
        ) : (
          <form onSubmit={handleSignup}>
            <input value={form.name} onChange={set('name')} placeholder="Full name" style={{ ...inpStyle, marginBottom: '0.8rem' }} />
            <input value={form.email} onChange={set('email')} placeholder="Email address" style={{ ...inpStyle, marginBottom: '0.8rem' }} type="email" autoComplete="email" />
            <div style={{ display: 'flex', gap: 8, marginBottom: '0.8rem' }}>
              <span style={{ background: '#1C2733', border: '1px solid ' + BORDER, borderRadius: 12, padding: '0.75rem 0.8rem', fontSize: '0.9rem', color: MUTED, whiteSpace: 'nowrap' }}>🇮🇳 +91</span>
              <input value={form.phone} onChange={set('phone')} placeholder="10-digit mobile" maxLength={10} style={{ ...inpStyle, flex: 1 }} />
            </div>
            <input type="password" value={form.password} onChange={set('password')} placeholder="Password (min 8 chars)" style={{ ...inpStyle, marginBottom: error ? '0.5rem' : '1rem' }} autoComplete="new-password" />
            {error && <div style={{ color: '#F44336', fontSize: '0.82rem', marginBottom: '0.8rem', lineHeight: 1.4 }}>{error}</div>}
            <button type="submit" disabled={loading} style={btnStyle('primary', { width: '100%', padding: '0.85rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.7 : 1 })}>
              {loading && <Spin s={14} />}{loading ? 'Creating account...' : 'Create Account'}
            </button>
            <p style={{ textAlign: 'center', fontSize: '0.85rem', color: MUTED, marginTop: '1rem' }}>Already registered? <span onClick={() => setAuthModal('login')} style={{ color: G, cursor: 'pointer', fontWeight: 600 }}>Sign in</span></p>
          </form>
        )}
      </div>
    </div>
  );
}

function BookingModal() {
  const { bookingModal, setBookingModal, selectedStation, showToast, createBooking } = useApp();
  const [step, setStep] = useState('confirm');
  const [loading, setLoading] = useState(false);
  const [ref, setRef] = useState('');
  useEffect(() => { if (bookingModal) { setStep('confirm'); setRef(''); } }, [bookingModal]);
  if (!bookingModal || !selectedStation) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      let bookingRef;
      try {
        const data = await createBooking({ stationId: selectedStation._id, connectorId: 'C001', scheduledStart: new Date(Date.now() + 3600000).toISOString(), durationMinutes: 60 });
        bookingRef = data.booking?.bookingRef;
      } catch { bookingRef = 'NC-' + Date.now().toString(36).toUpperCase(); }
      setRef(bookingRef); setStep('success'); showToast('Booking confirmed! ⚡');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.15s ease' }} onClick={e => e.target === e.currentTarget && setBookingModal(false)}>
      <div style={{ background: SURFACE, border: '1px solid ' + BORDER_G, borderRadius: 24, padding: '2.5rem', maxWidth: 460, width: '92vw', animation: 'slideUp 0.3s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontFamily: CLASH, fontSize: '1.3rem', fontWeight: 700 }}>{step === 'confirm' ? 'Confirm Booking' : 'Booking Confirmed'}</div>
          <button onClick={() => setBookingModal(false)} style={{ background: 'none', border: 'none', color: MUTED, fontSize: '1.3rem', cursor: 'pointer' }}>✕</button>
        </div>
        {step === 'confirm' ? (
          <>
            <div style={{ background: 'rgba(0,230,118,0.05)', border: '1px solid rgba(0,230,118,0.1)', borderRadius: 16, padding: '1.2rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ fontSize: '1.8rem' }}>{selectedStation.icon || '⚡'}</div>
                <div><div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4 }}>{selectedStation.name}</div><div style={{ fontSize: '0.8rem', color: MUTED }}>📍 {selectedStation.address}</div></div>
              </div>
              {[['Connector', selectedStation.connectors?.[0] || 'CCS2'],['Max speed', selectedStation.maxSpeed],['Price', selectedStation.price],['Ports open', selectedStation.portsOpen]].map(([k,v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: MUTED }}>{k}</span><span style={{ color: G, fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#FF9800', background: 'rgba(255,152,0,0.06)', border: '1px solid rgba(255,152,0,0.15)', borderRadius: 10, padding: '0.7rem 1rem', marginBottom: '1.5rem' }}>⚡ Free cancellation up to 30 min before your slot starts</div>
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button onClick={() => setBookingModal(false)} style={btnStyle('ghost', { flex: '0 0 auto', padding: '0.75rem 1.2rem', fontSize: '0.9rem' })}>Cancel</button>
              <button onClick={handleConfirm} disabled={loading} style={btnStyle('primary', { flex: 1, padding: '0.75rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.7 : 1 })}>
                {loading && <Spin s={16} />}{loading ? 'Confirming...' : '⚡ Confirm Booking'}
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🎉</div>
            <p style={{ color: MUTED, fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.2rem' }}>Your charging slot has been successfully reserved. A confirmation will be sent to your registered email and phone number.</p>
            <div style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid ' + BORDER_G, borderRadius: 12, padding: '1rem', fontFamily: CLASH, fontSize: '1.1rem', color: G, marginBottom: '1rem' }}>Booking ID: {ref}</div>
            <div style={{ fontSize: '0.82rem', color: MUTED, marginBottom: '1.5rem' }}>{selectedStation.name}<br />Today · 10:00 AM – 12:00 PM · CCS2 150kW</div>
            <button onClick={() => setBookingModal(false)} style={btnStyle('primary', { width: '100%', padding: '0.85rem', fontSize: '0.95rem' })}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

function AppContent() {
  const { searchStations, showToast } = useApp();
  const [apiStations, setApiStations] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { const data = await searchStations(''); if (data && data.length > 0) setApiStations(data); }
      catch (e) { /* silently use mock */ } finally { setLoading(false); }
    })();
  }, []); // eslint-disable-line

  const handleSearch = async (query) => {
    if (!query?.trim()) { setApiStations([]); return; }
    setLoading(true);
    try {
      const data = await searchStations(query);
      if (data !== null) { setApiStations(data); if (!data.length) showToast('No stations found for "' + query + '"', 'info'); }
    } catch { showToast('Search unavailable — showing local results', 'info'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: SATOSHI }}>
      <Navbar />
      <Hero />
      <StatsBar />
      <MapSection onSearch={handleSearch} />
      <StationsSection apiStations={apiStations} loading={loading} />
      <HowItWorks />
      <BookingSection />
      <AppSection />
      <Footer />
      <AuthModal />
      <BookingModal />
      <Toasts />
    </div>
  );
}

export default function App() {
  return <AppProvider><AppContent /></AppProvider>;
}
