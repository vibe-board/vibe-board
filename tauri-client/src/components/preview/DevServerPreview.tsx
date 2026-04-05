import { useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X, RefreshCw, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function DevServerPreview() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [inputUrl, setInputUrl] = useState(searchParams.get('url') || '');
  const [currentUrl, setCurrentUrl] = useState(searchParams.get('url') || '');
  const [loading, setLoading] = useState(false);

  const handleClose = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleRefresh = useCallback(() => {
    if (iframeRef.current && currentUrl) {
      setLoading(true);
      iframeRef.current.src = currentUrl;
    }
  }, [currentUrl]);

  const handleLoad = useCallback(() => {
    setLoading(false);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      let url = inputUrl.trim();
      if (url && !url.match(/^https?:\/\//)) {
        url = `http://${url}`;
      }
      setCurrentUrl(url);
    },
    [inputUrl],
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted border-b border-border">
        <button
          onClick={handleClose}
          className="p-1.5 rounded hover:bg-accent text-muted-foreground"
        >
          <X size={18} />
        </button>

        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-1.5">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="http://localhost:5173"
            className="flex-1 px-2.5 py-1.5 text-sm bg-background border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            className="p-1.5 rounded hover:bg-accent text-muted-foreground"
          >
            <ExternalLink size={16} />
          </button>
        </form>

        {currentUrl && (
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {/* Content */}
      {currentUrl ? (
        <iframe
          ref={iframeRef}
          src={currentUrl}
          className="flex-1 w-full border-0"
          onLoad={handleLoad}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">
              {t('preview.enterUrl')}
            </p>
            <p className="text-xs text-muted-foreground/60">
              {t('preview.example')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
