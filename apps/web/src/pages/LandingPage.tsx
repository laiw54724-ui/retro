import { Link } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { RetroButton } from "../components/RetroButton";

export function LandingPage() {
  const { user } = useAuth();
  return (
    <main className="landing-shell">
      <section className="landing-window retro-panel">
        <header className="landing-titlebar">歡迎使用 Retro Desktop.exe</header>
        {user ? <p className="info-box">已登入：{user.email}</p> : null}
        <div className="landing-hero">
          <div className="landing-copy">
            <span className="eyebrow">NO-CODE PERSONAL DESKTOP</span>
            <h1>把你的小宇宙，<br />裝進一台復古電腦。</h1>
            <p>拖拉視窗、放上圖片和連結，幾分鐘就能做出電子名片、OC 展示頁或作品集。不用寫程式，手機也能好好瀏覽。</p>
            <div className="button-row">
              <Link className="retro-link primary" to="/auth">{user ? "進入我的桌面 →" : "開始建立我的桌面 →"}</Link>
              <a className="retro-link" href="#examples">看看範例</a>
            </div>
          </div>
          <div className="hero-demo">
            <div className="demo-desktop">
              <div className="desktop-icons-demo"><span>名片</span><span>相簿</span><span>連結</span></div>
              <div className="demo-win one"><b>名片.exe</b><div className="demo-card-lines"><i /><strong>Mochi 麻糬</strong><i /><i /></div></div>
              <div className="demo-win two"><b>相簿</b><div className="demo-grid">{Array.from({ length: 6 }).map((_, index) => <i key={index} />)}</div></div>
              <div className="demo-taskbar"><RetroButton>開始</RetroButton></div>
            </div>
          </div>
        </div>
      </section>

      <section className="steps-grid">
        {[
          ["01", "選網址與主題", "取一個個人網址，挑一套復古配色。"],
          ["02", "新增視窗", "文件、相簿、連結、關於我——拖到想要的位置。"],
          ["03", "發布分享", "預覽桌面與手機版，一鍵發布後分享網址。"]
        ].map(([n, title, description]) => (
          <article className="retro-panel step-card" key={n}>
            <span>{n}</span>
            <div><strong>{title}</strong><p>{description}</p></div>
          </article>
        ))}
      </section>

      <section id="examples" className="retro-panel examples">
        <header className="landing-titlebar">範例作品</header>
        <div className="example-grid">
          {["電子名片", "復古 IG", "OC 展示頁", "作品集"].map((name) => (
            <article key={name}>
              <div className="example-thumb"><div /><div /></div>
              <strong>{name}</strong>
              <p>用不同視窗組成自己的小網站。</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
