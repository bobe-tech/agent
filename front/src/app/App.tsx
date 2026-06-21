import { Link } from '@heroui/react';
import { Link as RouterLink, Route, Routes } from 'react-router-dom';
import { siX, siTelegram, siYoutube, siMedium, siTiktok, siReddit } from 'simple-icons';
import { AppProviders } from './providers.js';
import { DashboardPage } from '@/pages/dashboard';
import { PromptsPage } from '@/pages/prompts';
import { NotFoundPage } from '@/pages/not-found';
import { PairSelector } from '@/features/select-pair';
import { PriceTicker } from '@/widgets/price-ticker';
import { useDashboardState } from '@/shared/dashboard-state';

function Header() {
  const { selectedPair } = useDashboardState();
  return (
    <header
      data-testid="app-header"
      className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="mx-auto flex h-14 w-full max-w-screen-xl items-center gap-3 px-4">
        {/* Logo — a link to the home page, followed by the pair selector and price. */}
        <RouterLink to="/" aria-label="BoBe App" className="shrink-0">
          <img src="/logo.png" alt="BoBe Agent" className="size-8" />
        </RouterLink>
        <PairSelector />
        <PriceTicker pair={selectedPair} />
      </div>
    </header>
  );
}

// Envelope (filled, 24×24) styled consistently with the Simple Icons brand icons — email has no brand icon.
const MAIL_PATH =
  'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z';

const SOCIAL_LINKS = [
  { href: 'https://x.com/bobeapp', label: 'X', path: siX.path },
  { href: 'https://t.me/bobeapp', label: 'Telegram', path: siTelegram.path },
  { href: 'https://www.youtube.com/@bobeapp', label: 'YouTube', path: siYoutube.path },
  { href: 'https://bobeapp.medium.com/', label: 'Medium', path: siMedium.path },
  { href: 'https://www.tiktok.com/@bobe.app', label: 'TikTok', path: siTiktok.path },
  { href: 'https://www.reddit.com/user/Bobe-app/', label: 'Reddit', path: siReddit.path },
  { href: 'mailto:info@bobe.app', label: 'Email', path: MAIL_PATH },
];

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer data-testid="app-footer" className="border-t border-border px-4 pt-6 pb-6 text-sm text-muted">
      <div className="mx-auto flex max-w-screen-xl flex-col items-center gap-5 text-center">
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {SOCIAL_LINKS.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={s.label}
              className="text-muted transition-colors hover:text-foreground"
            >
              {/* X (Twitter) fills the entire viewBox to the corners and looks optically larger than the rest —
                  we compensate with a slight scale-down so all icons appear the same size */}
              <svg
                role="img"
                viewBox="0 0 24 24"
                className={s.label === 'X' ? 'size-5 scale-[0.82]' : 'size-5'}
                fill="currentColor"
                aria-hidden="true"
              >
                <path d={s.path} />
              </svg>
            </a>
          ))}
        </nav>
        <div>
          © {year}{' '}
          <Link href="https://bobe.app" target="_blank" rel="noopener noreferrer">
            Bobe App
          </Link>
        </div>
      </div>
    </footer>
  );
}

export function App() {
  return (
    <AppProviders>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <Header />
        <main className="mx-auto w-full max-w-screen-xl flex-1 px-4 py-6" data-testid="app-main">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/prompts" element={<PromptsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </AppProviders>
  );
}
