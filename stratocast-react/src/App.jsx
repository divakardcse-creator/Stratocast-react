import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_PLACE, DEFAULT_SETTINGS, store, fetchWeather, searchCities, reverseGeocode, getPosition, wmo, pad, T, Wd, WU,
  compass, clockStr, hourLabel, durStr, placeClock, agoStr, uvLabel, humLabel, cloudLabel, dewLabel, visLabel, aqiInfo,
  placeholderModel, describe, buildAlerts, ICONS, wxSvg, heroArt, solarSvg, ringSvg
} from './lib.js';
import ThemeToggle from './Themetoggle.jsx';
import logo from "./assets/stratocast-minimal.svg";
/* ---------- tiny building blocks ---------- */
const Ic = ({ n, s = 16 }) => <svg className="i" viewBox="0 0 24 24" width={s} height={s} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[n] }} />;
const Raw = ({ html, as: Tag = 'span', ...p }) => <Tag {...p} dangerouslySetInnerHTML={{ __html: html }} />;
const Wx = ({ kind, day = true, size = 22 }) => <Raw html={wxSvg(kind, day, size)} style={{ display: 'inline-flex' }} />;
const placeLabel = p => p.name + (p.country ? ', ' + p.country : '');
const dayName = (d, i) => (i === 0 ? 'Today' : new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }));
const dayDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/* ---------- hooks ---------- */
function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}
function usePersisted(key, initial) {
  const [v, setV] = useState(() => store.get(key, initial));
  useEffect(() => store.set(key, v), [key, v]);
  return [v, setV];
}
function useWeather(place, refreshMin) {
  const [m, setM] = useState(null);
  const [status, setStatus] = useState('loading');
  const [err, setErr] = useState('');
  const [nextAt, setNextAt] = useState(0);
  const seq = useRef(0);
  const refreshRef = useRef(refreshMin);
  refreshRef.current = refreshMin;
  const load = useCallback(async () => {
    const my = ++seq.current;
    setStatus('loading');
    try {
      const r = await fetchWeather(place);
      if (my !== seq.current) return 'stale';
      setM(r); setStatus('ok'); setErr('');
      setNextAt(refreshRef.current ? Date.now() + refreshRef.current * 60000 : 0);
      return 'ok';
    } catch {
      if (my !== seq.current) return 'stale';
      setStatus('error'); setErr(navigator.onLine ? 'The weather service did not respond.' : 'You appear to be offline.');
      setNextAt(Date.now() + 30000);
      return 'error';
    }
  }, [place]);
  useEffect(() => { setM(null); load(); }, [load]);
  useEffect(() => { if (m) setNextAt(refreshMin ? Date.now() + refreshMin * 60000 : 0); }, [refreshMin]); // eslint-disable-line
  return { m, status, err, nextAt, load };
}

/* ---------- sections ---------- */
function Sidebar({ nav, onNav, locCount, status, nextAt, now, refreshMin, onDeploy }) {
  const items = [['home', 'home', 'Home'], ['forecast', 'thermo', 'Forecast'], ['locations', 'pin', 'Locations'], ['radar', 'radar', 'Radar'], ['analytics', 'chart', 'Analytics'], ['settings', 'sliders', 'Settings']];
  const left = Math.max(0, Math.round((nextAt - now) / 1000));
  const scan = !refreshMin ? 'Auto-refresh is off' : status === 'loading' ? 'Scanning\u2026' : nextAt ? `Next scan in ${pad(Math.floor(left / 60))}m ${pad(left % 60)}s` : 'Waiting for first scan';
  const chip = status === 'error' ? ['bad', 'Offline'] : status === 'loading' ? ['warn', 'Syncing'] : ['', 'Synced'];
  return (
    <aside className="side" aria-label="Primary">
      <div>
        <div className="brand"><img src={logo} alt="StratoCast logo" width="44" height="44" /><div><b>StratoCast</b><span>Forecast Beyond The Ordinary</span></div></div>
        <nav className="nav" aria-label="Main navigation">
          {items.map(([k, i, t]) => (
            <button key={k} className={nav === k ? 'on' : ''} onClick={() => onNav(k)}>
              <Ic n={i} />{t}
              {k === 'locations' && locCount > 0 && <span className="badge">{locCount}</span>}
              {k === 'radar' && <span className="ping" aria-hidden="true" />}
            </button>
          ))}
        </nav>
        <button className="deploy" onClick={onDeploy}><Ic n="bell" s={15} />Deploy Alert</button>
      </div>
      <div className="sfoot">
        <div className="radarbox">
          <div className="row1"><span className="lbl">Radar telemetry</span><span className={'chip ' + chip[0]}><i />{chip[1]}</span></div>
          <strong>Open-Meteo Model Feed</strong><small>{scan}</small>
        </div>
        <nav aria-label="Help">
          <a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener noreferrer"><Ic n="book" s={13} />Documentation</a>
          <a href="https://open-meteo.com/en/about" target="_blank" rel="noopener noreferrer"><Ic n="book" s={13} />Support</a>
        </nav>
      </div>
    </aside>
  );
}

function Header({ place, m, status, settings, now, alertLvl, onSearch, onGps, onRefresh, onUnit, onBell, onSettings }) {
  const live = status === 'error' ? ' off' : status === 'loading' ? ' sync' : '';
  return (
    <header className="head">
      <div className="hl">
        <button className="pill" onClick={onSearch} aria-label="Change location">
          <Ic n="pin" />
          <span>
            <span className="c1"><span>{placeLabel(place)}</span><Ic n="chevD" s={9} /></span>
            <span className="c2" style={{ display: 'block' }}>{m ? placeClock(m.tz, settings.clock) : 'Loading\u2026'}</span>
          </span>
        </button>
        <button className="sqb gpsb" onClick={onGps} aria-label="Use my location" title="Use my location"><Ic n="gps" s={15} /></button>
        <div className="cmd">
          <Ic n="search" s={14} />
          <button className="ph" onClick={onSearch} aria-label="Search city, airport or coordinates">Search city, airport or coords...</button>
          <kbd>&#8984;K</kbd>
        </div>
      </div>
      
      <div className="hr">
        <div className={'live' + live}>
          <i />
          <span>
            <span className="t1">{status === 'error' ? 'Offline \u00B7 ' : status === 'loading' ? 'Syncing\u2026' : 'Live \u00B7 '}</span>
            <span className="t2">{status === 'ok' && m ? 'Updated ' + agoStr(m.updatedAt) : status === 'error' ? 'Retry' : ''}</span>
          </span>
          <button className={status === 'loading' ? 'spin' : ''} onClick={onRefresh} aria-label="Refresh weather" title="Refresh"><Ic n="refresh" s={12} /></button>
        </div>
        <div className="seg" role="group" aria-label="Temperature unit">
          {['C', 'F'].map(u => <button key={u} className={settings.temp === u ? 'on' : ''} aria-pressed={settings.temp === u} onClick={() => onUnit(u)}>&deg;{u}</button>)}
        </div>
        <button className="sqb" onClick={onBell} aria-label="Weather alerts"><Ic n="bell" s={15} />{m && alertLvl >= 2 && <span className="dot" />}</button>
        <span className="sep" />
        <button className="me" onClick={onSettings} aria-label="Open settings">SC</button>
      </div>
    </header>
  );
}

function Notice({ view, status, err, hasModel, permMsg, onView, onGps, onRetry }) {
  if (view === 'permission') {
    return (
      <div className="notice" role="alert">
        <div className="nic"><Ic n="gps" s={22} /></div>
        <div><h3>{permMsg ? 'Location access is blocked' : 'Allow location access?'}</h3><p>{permMsg || 'StratoCast uses your position only to show weather for where you are. You can always search for a city instead.'}</p></div>
        <div className="acts"><button className="btn ghost" onClick={() => onView('normal')}>Not now</button><button className="btn" onClick={onGps}>{permMsg ? 'Try again' : 'Allow location'}</button></div>
      </div>
    );
  }
  if (view === 'offline' || status === 'error') {
    return (
      <div className="notice err" role="alert">
        <div className="nic"><Ic n="cloudOff" s={22} /></div>
        <div><h3>Can&rsquo;t reach the weather service</h3><p>{err || 'You appear to be offline.'} {hasModel ? 'Showing the last saved reading.' : 'No saved reading is available yet.'}</p></div>
        <div className="acts"><button className="btn" onClick={onRetry}>Retry now</button></div>
      </div>
    );
  }
  return null;
}

function AlertBanner({ alerts, expanded, dismissed, onExpand, onDismiss }) {
  const a = alerts[0];
  if (dismissed === a.title) return null;
  return (
    <section className={'alert l' + a.lvl} id="sec-alert" aria-label="Weather alerts">
      <div className="alert-top">
        <div className="alert-l">
          <div className="aic"><Ic n={a.lvl ? 'alert' : 'check'} s={18} /></div>
          <div>
            <div className="atags"><span className="atag">{a.tag}</span><span className="atitle">{a.title}</span>{alerts.length > 1 && <span className="atag">+{alerts.length - 1} more</span>}</div>
            <div className="abody">{a.body}</div>
          </div>
        </div>
        <div className="alert-r">
          <button className="abtn" aria-expanded={expanded} onClick={onExpand}>Expand Advisory Details <Ic n="chevD" s={12} /></button>
          <button className="aclose" onClick={onDismiss} aria-label="Dismiss alert"><Ic n="close" s={14} /></button>
        </div>
      </div>
      {expanded && <div className="alist">{alerts.map(x => <div key={x.title}><b><span className={'lv lv' + x.lvl} />{x.title}</b><p>{x.body}</p></div>)}</div>}
    </section>
  );
}

function Hero({ m, s }) {
  const n = m.now, u = s.temp, wx = wmo(n.code, n.day), aq = aqiInfo(m.aqi);
  return (
    <section className="hero c8" aria-label="Current weather">
      <div className="hmeta">
        <div className="hchips">
          <span className="hchip"><Ic n="gps" s={12} />Ground Station &bull; Elev. {m.elevation} m</span>
          {aq && <span className={'hchip ' + aq.c}>Air Quality: {aq.t} (AQI {Math.round(m.aqi)})</span>}
        </div>
        <div className="obs"><span className="lbl">Observed condition</span><b>{wx.label} &bull; {m.popMax >= 40 ? 'Wet Front' : 'Dry Front'}</b></div>
      </div>
      <div className="stage">
        <div>
          <div className="tbig"><span className="n">{T(n.t, u)}&deg;</span><span className="u">{u}</span><span className="feels">Feels like <b>{T(n.feels, u)}&deg;{u}</b></span></div>
          <div className="hl3">
            <span className="it"><Ic n="up" s={11} /><span>High:<b>{T(m.hi, u)}&deg;{u}</b></span></span><span className="bul">&bull;</span>
            <span className="it"><Ic n="down" s={11} /><span>Low:<b>{T(m.lo, u)}&deg;{u}</b></span></span><span className="bul">&bull;</span>
            <span className="it"><Ic n="sunset" s={14} /><span>Sunset<b>{clockStr(m.sunset, s.clock)}</b></span></span>
          </div>
          <p className="readout">{describe(m, s)}</p>
        </div>
        <Raw as="div" className="art-wrap" html={heroArt(wx.kind, n.day)} />
      </div>
      <div className="hfoot">
        <div className="badges"><span><i />Barometer: <b>{Math.round(n.press)} hPa ({m.trend})</b></span><span><i />Cloud Base: <b>{m.cloudBase.toLocaleString()} m AGL (est.)</b></span></div>
        <small>Source: Open-Meteo &bull; {m.place.lat.toFixed(2)}&deg;, {m.place.lon.toFixed(2)}&deg;</small>
      </div>
    </section>
  );
}

function Solar({ m, s }) {
  const tot = durStr(m.daylight);
  return (
    <section className="card solar c4" aria-label="Sunrise and sunset">
      <div className="shead"><div><div className="lbl">Solar telemetry</div><h2 className="h2">Sun Trajectory &amp; Daylight</h2></div><Ic n="sun" s={18} /></div>
      <Raw as="div" className="sarc" html={solarSvg(m.frac)} />
      <div className="sribbon">
        <div><span className="sico"><Ic n="sunrise" s={14} /></span><span><small>SUNRISE</small><b>{clockStr(m.sunrise, s.clock)}</b></span></div>
        <div><span className="sico"><Ic n="sunset" s={14} /></span><span><small>SUNSET</small><b>{clockStr(m.sunset, s.clock)}</b></span></div>
      </div>
      <div className="dl"><span>Daylight<br />remaining:</span><b>{m.remaining > 0 ? `${durStr(m.remaining)} remaining (${tot} total)` : `Sun has set (${tot} total)`}</b></div>
    </section>
  );
}

function Hourly({ m, s }) {
  const track = useRef(null);
  return (
    <section className="card hsec" id="sec-hourly">
      <div className="shd">
        <div><Ic n="clock" s={17} /><h2 className="h2">24-Hour Atmospheric Hourly Progression</h2></div>
        <div>
          <span className="hint">Scroll horizontally for complete microburst telemetry</span>
          <span className="arrows">
            <button aria-label="Scroll earlier hours" onClick={() => track.current.scrollBy({ left: -288, behavior: 'smooth' })}><Ic n="chevL" s={12} /></button>
            <button aria-label="Scroll later hours" onClick={() => track.current.scrollBy({ left: 288, behavior: 'smooth' })}><Ic n="chevR" s={12} /></button>
          </span>
        </div>
      </div>
      <div className="track" ref={track} tabIndex={0} aria-label="Hourly forecast">
        {m.hours.map((h, i) => (
          <div key={i} className={'hc ' + (i === 0 ? 'now' : h.pop >= 60 ? 'wet' : h.pop >= 40 ? 'mid' : '')}>
            <span className="tm">{i === 0 ? 'NOW' : hourLabel(h.h, s.clock)}</span>
            <Wx kind={wmo(h.code, h.day).kind} day={h.day} />
            <span className="tp">{T(h.t, s.temp)}&deg;</span>
            <div className="pr"><span><Ic n="drop" s={11} />{h.pop}%</span><div className="bar"><i style={{ width: h.pop + '%' }} /></div></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Tile({ title, ico, children }) {
  return <article className="tile"><div className="th"><span>{title}</span><Ic n={ico} s={17} /></div>{children}</article>;
}
function Metrics({ m, s, now }) {
  const n = m.now, u = s.temp;
  const spread = u === 'F' ? (n.t - n.dew) * 9 / 5 : n.t - n.dew;
  const bf = n.wind < 12 ? 'Light breeze' : n.wind < 29 ? 'Moderate breeze' : n.wind < 50 ? 'Strong breeze' : 'Gale force';
  return (
    <section className="metrics" id="sec-metrics">
      <div className="shd"><div><Ic n="chart" s={18} /><h2 className="h2">Atmospheric Detail Metrics</h2></div><span className="hint">Updated {agoStr(m.updatedAt)}</span></div>
      <div className="tiles" data-now={now}>
        <Tile title="Humidity" ico="drop">
          <div className="big"><div><div className="val">{n.hum}<small>%</small></div><p>{humLabel(n.hum)} air</p></div>
            <div className="gauge"><Raw html={ringSvg(n.hum)} /><b>{n.hum}</b></div></div>
          <span className="tag">Dew point {T(n.dew, u)}&deg;{u}</span>
        </Tile>
        <Tile title="Wind" ico="wind">
          <div className="big"><div><div className="val">{Wd(n.wind, s.wind)}<small>{WU[s.wind]}</small></div><p>From {compass(n.dir)} ({Math.round(n.dir)}&deg;)</p></div>
            <div className="rose" role="img" aria-label={'Wind from ' + compass(n.dir)}><span className="n">N</span>
              <svg viewBox="0 0 24 24" className="i" style={{ transform: `rotate(${Math.round(n.dir) + 180}deg)` }}><path d="M12 20V4M6 10l6-6 6 6" /></svg></div></div>
          <span className="tag em">Gusts {Wd(n.gust, s.wind)} {WU[s.wind]} &bull; {bf}</span>
        </Tile>
        <Tile title="Rain Probability" ico="drop">
          <div className="val">{m.popMax}<small>%</small></div><p>{m.rainToday.toFixed(1)} mm expected today</p>
          <div className="prog" role="progressbar" aria-valuenow={m.popMax} aria-valuemin={0} aria-valuemax={100}><i style={{ width: m.popMax + '%' }} /></div>
          <span className="tag">Accumulated in last 24h: {m.rain24.toFixed(1)} mm</span>
        </Tile>
        <Tile title="UV Index" ico="sun">
          <div className="val">{Math.round(n.uv)}<small>{uvLabel(n.uv)}</small></div><p>{m.uvAdvice}</p>
          <div className="uvbar"><i style={{ left: Math.min(100, n.uv / 11 * 100) + '%' }} /></div>
          <span className="tag">Today&rsquo;s peak: {Math.round(m.uvMax)} ({uvLabel(m.uvMax)})</span>
        </Tile>
        <Tile title="Atmospheric Pressure" ico="gauge">
          <div className="val">{Math.round(n.press)}<small>hPa</small></div>
          <p>{m.trend === 'Rising' ? '\u2197' : m.trend === 'Falling' ? '\u2198' : '\u2192'} {m.trend} over the last 3 hours</p>
          <span className="tag">Equivalent: {(n.press * 0.02953).toFixed(2)} inHg</span>
        </Tile>
        <Tile title="Visibility Range" ico="eye">
          <div className="val">{n.vis >= 10 ? Math.round(n.vis) : n.vis.toFixed(1)}<small>km</small></div><p>{visLabel(n.vis)}</p>
          <span className="tag">Range: {n.vis >= 10 ? 'Excellent' : n.vis >= 4 ? 'Good' : n.vis >= 1 ? 'Fair' : 'Poor'}</span>
        </Tile>
        <Tile title="Cloud Cover" ico="cloud">
          <div className="val">{n.cloud}<small>%</small></div><p>{cloudLabel(n.cloud)}</p>
          <span className="tag">Ceiling elevation: {m.cloudBase.toLocaleString()} m AGL</span>
        </Tile>
        <Tile title="Dew Point" ico="thermo">
          <div className="val">{T(n.dew, u)}&deg;</div><p>{dewLabel(n.dew)}</p>
          <span className="tag">Temp&ndash;dew spread: {Math.round(spread)}&deg;</span>
        </Tile>
      </div>
    </section>
  );
}

function Weekly({ m, s }) {
  const u = s.temp;
  const wmin = Math.min(...m.days.map(d => d.min)), wmax = Math.max(...m.days.map(d => d.max)), span = Math.max(1, wmax - wmin);
  return (
    <section className="card wk" id="sec-weekly">
      <div className="shd"><div><Ic n="layers" s={16} /><h2 className="h2">7-Day Extended Forecast</h2></div><span className="hint">Week range {T(wmin, u)}&deg; &ndash; {T(wmax, u)}&deg;{u}</span></div>
      <div className="list">
        {m.days.map((d, i) => {
          const w = wmo(d.code, true), l = (d.min - wmin) / span * 100, wd = Math.min(Math.max(8, (d.max - d.min) / span * 100), 100 - l);
          return (
            <div key={d.date} className={'dr' + (i === 0 ? ' today' : '')}>
              <div className="d"><b>{dayName(d.date, i)}</b><span>{dayDate(d.date)}</span></div>
              <div className="cd"><Wx kind={w.kind} size={24} /><span>{w.label}</span></div>
              <div className="rn"><Ic n="drop" s={12} />{d.pop}%</div>
              <div className="rg"><span>{T(d.min, u)}&deg;</span><div className="rt" role="img" aria-label={`${T(d.min, u)} to ${T(d.max, u)} degrees`}><i style={{ left: l.toFixed(1) + '%', width: wd.toFixed(1) + '%' }} /></div><span>{T(d.max, u)}&deg;</span></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StateSwitcher({ view, onView }) {
  const opts = [['normal', 'Normal View'], ['permission', 'Permission Prompt'], ['skeleton', 'Skeleton Loading'], ['offline', 'Offline Retry']];
  return (
    <section className="states">
      <div><Ic n="sliderState" s={15} /><div><span className="lbl">Interactive UI state switcher</span><small>Preview edge states required for high-reliability systems</small></div></div>
      <div className="sbtns">{opts.map(([v, t]) => <button key={v} className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => onView(v)}>{t}</button>)}</div>
    </section>
  );
}

/* ---------- modals ---------- */
function Modal({ title, wide, onClose, children }) {
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="mh"><h2>{title}</h2><button className="sqb" onClick={onClose} aria-label="Close"><Ic n="close" s={16} /></button></div>
        <div className="mb">{children}</div>
      </div>
    </div>
  );
}

function SearchModal({ recent, onPick, onRemove, onGps, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [state, setState] = useState('idle');
  const [sel, setSel] = useState(-1);
  const seq = useRef(0);
  const input = useRef(null);
  useEffect(() => { input.current && input.current.focus(); }, []);
  useEffect(() => {
    setSel(-1);
    if (q.trim().length < 2) { setState('idle'); return; }
    setState('loading');
    const my = ++seq.current;
    const id = setTimeout(async () => {
      try { const r = await searchCities(q.trim()); if (my === seq.current) { setResults(r); setState('done'); } }
      catch { if (my === seq.current) setState('error'); }
    }, 300);
    return () => clearTimeout(id);
  }, [q]);
  const searching = q.trim().length >= 2;
  const items = searching ? (state === 'done' ? results : []) : recent;
  const onKey = e => {
    if (!items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setSel(s => (s + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length); }
    if (e.key === 'Enter') { e.preventDefault(); onPick(items[sel >= 0 ? sel : 0]); }
  };
  const Opt = ({ i, name, sub, ico, onClick, onX }) => (
    <button className={'opt' + (sel === i ? ' act' : '')} onClick={onClick}>
      <span className="oi"><Ic n={ico} /></span><span><b>{name}</b><small>{sub}</small></span>
      {onX && <span className="x" role="button" aria-label={'Remove ' + name} onClick={e => { e.stopPropagation(); onX(); }}><Ic n="trash" s={14} /></span>}
    </button>
  );
  return (
    <Modal title="Search location" onClose={onClose}>
      <div className="sbox"><Ic n="search" /><input ref={input} type="search" value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search city, airport or coords…" autoComplete="off" aria-label="Search for a city" /></div>
      <div aria-live="polite">
        {!searching && (
          <>
            <button className="opt" onClick={onGps}><span className="oi"><Ic n="gps" /></span><span><b>Use my location</b><small>Detect automatically with GPS</small></span></button>
            <div className="mlab">Recent locations</div>
            {recent.length ? recent.map((r, i) => <Opt key={r.lat + ',' + r.lon} i={i} name={r.name} sub={r.country || 'Saved location'} ico="clock" onClick={() => onPick(r)} onX={() => onRemove(i)} />)
              : <div className="empty"><Ic n="pin" s={26} />No recent locations yet.<br />Search for a city to get started.</div>}
          </>
        )}
        {searching && state === 'loading' && <div className="empty"><Ic n="refresh" s={26} />Searching…</div>}
        {searching && state === 'error' && <div className="empty"><Ic n="cloudOff" s={26} />Search failed. Check your connection and try again.</div>}
        {searching && state === 'done' && !results.length && <div className="empty"><Ic n="search" s={26} />No cities found for &ldquo;{q}&rdquo;.<br />Try a different spelling or a nearby city.</div>}
        {searching && state === 'done' && results.length > 0 && (
          <>
            <div className="mlab">Suggestions</div>
            {results.map((r, i) => <Opt key={r.lat + ',' + r.lon} i={i} name={r.name} sub={[r.admin, r.country].filter(Boolean).join(', ')} ico="pin" onClick={() => onPick(r)} />)}
          </>
        )}
      </div>
    </Modal>
  );
}

function SettingsModal({ s, setS, savedCount, onClear, onClose }) {
  const Seg = ({ k, opts }) => (
    <span className="seg" role="group">{opts.map(([v, t]) => <button key={v} className={String(s[k]) === String(v) ? 'on' : ''} onClick={() => setS({ ...s, [k]: k === 'refresh' ? +v : v })}>{t}</button>)}</span>
  );
  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="fld"><div><b>Temperature</b><small>Applies across the whole dashboard</small></div><Seg k="temp" opts={[['C', '\u00B0C'], ['F', '\u00B0F']]} /></div>
      <div className="fld"><div><b>Wind speed</b><small>Unit for wind and gusts</small></div><Seg k="wind" opts={[['kmh', 'km/h'], ['mph', 'mph'], ['ms', 'm/s']]} /></div>
      <div className="fld"><div><b>Time format</b><small>Sunrise, sunset and hourly labels</small></div><Seg k="clock" opts={[['24', '24h'], ['12', '12h']]} /></div>
      <div className="fld"><div><b>Auto-refresh</b><small>How often fresh data is fetched</small></div><Seg k="refresh" opts={[[5, '5 min'], [10, '10 min'], [30, '30 min'], [0, 'Off']]} /></div>
      <div className="fld"><div><b>Saved locations</b><small>{savedCount} stored on this device</small></div><button className="btn ghost" onClick={onClear}>Clear</button></div>
    </Modal>
  );
}

function RadarModal({ place, onClose }) {
  const src = `https://embed.windy.com/embed2.html?lat=${place.lat}&lon=${place.lon}&detailLat=${place.lat}&detailLon=${place.lon}&zoom=7&level=surface&overlay=radar&product=radar&marker=true&calendar=now&type=map&location=coordinates&metricWind=km%2Fh&metricTemp=%C2%B0C`;
  return (
    <Modal title="Live radar" wide onClose={onClose}>
      <iframe className="radar" title="Live precipitation radar" loading="lazy" referrerPolicy="no-referrer" src={src} />
      <small style={{ color: 'var(--muted)' }}>Radar imagery by Windy.com. Centered on {placeLabel(place)}.</small>
    </Modal>
  );
}

/* ---------- app ---------- */
export default function App() {
  const [place, setPlace] = usePersisted('place', DEFAULT_PLACE);
  const [settings, setSettings] = usePersisted('settings', DEFAULT_SETTINGS);
  const [recent, setRecent] = usePersisted('recent', []);
  const s = useMemo(() => ({ ...DEFAULT_SETTINGS, ...settings }), [settings]);
  const { m, status, err, nextAt, load } = useWeather(place, s.refresh);
  const now = useNow();
  const [view, setView] = useState('normal');
  const [permMsg, setPermMsg] = useState('');
  const [modal, setModal] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState('');
  const [nav, setNav] = useState('home');
  const [toasts, setToasts] = useState([]);

  const toast = useCallback(msg => {
    const id = Math.random();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);
  const data = m || placeholderModel();
  const alerts = useMemo(() => buildAlerts(data, s), [data, s]);

  // auto refresh + online/offline + Ctrl/Cmd+K + scroll spy
  useEffect(() => { if (s.refresh && nextAt && now >= nextAt && status !== 'loading') load(); }, [now, nextAt, status, s.refresh, load]);
  useEffect(() => {
    const on = () => load();
    window.addEventListener('online', on);
    const key = e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setModal('search'); } };
    document.addEventListener('keydown', key);
    return () => { window.removeEventListener('online', on); document.removeEventListener('keydown', key); };
  }, [load]);
  useEffect(() => {
    const spy = () => {
      if (modal) return;
      const y = window.scrollY + 140, at = id => { const e = document.querySelector(id); return e ? e.offsetTop : 1e9; };
      setNav(y >= at('#sec-metrics') - 40 ? 'analytics' : y >= at('#sec-hourly') - 40 ? 'forecast' : 'home');
    };
    window.addEventListener('scroll', spy, { passive: true });
    return () => window.removeEventListener('scroll', spy);
  }, [modal]);

  const pickPlace = p => {
    const next = { name: p.name, country: p.country, lat: p.lat, lon: p.lon };
    setRecent([next, ...recent.filter(r => Math.abs(r.lat - p.lat) > 0.01 || Math.abs(r.lon - p.lon) > 0.01)].slice(0, 5));
    setPlace(next); setView('normal'); setModal(null);
  };
  const useGps = async () => {
    toast('Finding your location…');
    try {
      const c = await getPosition(), r = await reverseGeocode(c.latitude, c.longitude);
      setPermMsg(''); pickPlace({ name: r.name, country: r.country, lat: c.latitude, lon: c.longitude });
    } catch (e) {
      setPermMsg(e && e.code === 1 ? 'Permission was denied. Allow location for this site in your browser settings, or search for a city.' : 'We couldn\u2019t determine your position. Check your connection or search for a city.');
      setView('permission'); setModal(null); toast('Location unavailable');
    }
  };
  const refresh = async () => { const r = await load(); if (r === 'ok') { if (view === 'offline') setView('normal'); toast('Weather updated'); } };
  const goNav = n => {
    if (n === 'locations') return setModal('search');
    if (n === 'settings') return setModal('settings');
    if (n === 'radar') return setModal('radar');
    setNav(n);
    const el = n === 'forecast' ? document.querySelector('#sec-hourly') : n === 'analytics' ? document.querySelector('#sec-metrics') : null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); else window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const deploy = async () => {
    const a = alerts[0];
    try {
      if ('Notification' in window) {
        let p = Notification.permission; if (p === 'default') p = await Notification.requestPermission();
        if (p === 'granted') { new Notification('StratoCast \u2022 ' + a.title, { body: a.body }); return toast('Alert deployed to this device'); }
      }
    } catch { /* fall back to toast */ }
    toast(a.title + ': ' + a.body);
  };
  const bell = () => {
    setDismissed(''); setExpanded(true);
    toast(alerts[0].lvl ? `${alerts.length} active advisor${alerts.length > 1 ? 'ies' : 'y'}` : 'No active advisories');
    setTimeout(() => { const el = document.querySelector('#sec-alert'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50);
  };
  const activeNav = modal === 'search' ? 'locations' : modal === 'settings' ? 'settings' : modal === 'radar' ? 'radar' : nav;
  const skeleton = view === 'skeleton' || (!m && status === 'loading');
  const retry = async () => { const r = await load(); if (r === 'ok') { setView('normal'); toast('Back online'); } };

  return (
    <div className="app">
      <Sidebar nav={activeNav} onNav={goNav} locCount={recent.length} status={status} nextAt={nextAt} now={now} refreshMin={s.refresh} onDeploy={deploy} />
      <div className="wrap">
        <Header place={place} m={m} status={status} settings={s} now={now} alertLvl={alerts[0].lvl}
          onSearch={() => setModal('search')} onGps={useGps} onRefresh={refresh} onBell={bell}
          onUnit={u => setSettings({ ...s, temp: u })} onSettings={() => setModal('settings')} />
        <main className={skeleton ? 'skeleton' : ''} aria-live="polite">
          <Notice view={view} status={status} err={err} hasModel={!!m} permMsg={permMsg} onView={setView} onGps={useGps} onRetry={retry} />
          <AlertBanner alerts={alerts} expanded={expanded} dismissed={dismissed} onExpand={() => setExpanded(!expanded)} onDismiss={() => { setDismissed(alerts[0].title); toast('Advisory dismissed'); }} />
          <div className="row"><Hero m={data} s={s} /><Solar m={data} s={s} /></div>
          <Hourly m={data} s={s} />
          <Metrics m={data} s={s} now={Math.floor(now / 60000)} />
          <Weekly m={data} s={s} />
          <StateSwitcher view={view} onView={v => { setPermMsg(''); setView(v); }} />
        </main>
      </div>

      <nav className="bnav" aria-label="Bottom navigation">
        {[['home', 'home', 'Home'], ['forecast', 'thermo', 'Forecast'], ['locations', 'pin', 'Locations'], ['settings', 'sliders', 'Settings']].map(([k, i, t]) => (
          <button key={k} className={activeNav === k ? 'on' : ''} onClick={() => goNav(k)}><Ic n={i} s={20} />{t}</button>
        ))}
      </nav>

      {modal === 'search' && <SearchModal recent={recent} onPick={pickPlace} onGps={useGps} onClose={() => setModal(null)} onRemove={i => setRecent(recent.filter((_, k) => k !== i))} />}
      {modal === 'settings' && <SettingsModal s={s} setS={setSettings} savedCount={recent.length} onClear={() => { setRecent([]); toast('Saved locations cleared'); }} onClose={() => setModal(null)} />}
      {modal === 'radar' && <RadarModal place={place} onClose={() => setModal(null)} />}
      <ThemeToggle/>
      <div className="toasts">{toasts.map(t => <div key={t.id} className="toast" role="status">{t.msg}</div>)}</div>
    </div>
  );
}
