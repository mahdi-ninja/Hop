import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Button, Card } from './ui';

function download(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
}

export function QrCode({ url, name }: { url: string; name: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(
      (markup) => !cancelled && setSvg(markup),
      () => !cancelled && setSvg(null),
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  const downloadSvg = () => {
    if (!svg) return;
    const href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    download(href, `${name}.svg`);
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  const downloadPng = async () => {
    download(await QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' }), `${name}.png`);
  };

  return (
    <Card className="flex flex-col items-center gap-3">
      <h2 className="self-start text-sm font-medium">QR code</h2>
      {/* The QR is always dark-on-white so it stays scannable in dark mode. */}
      <div
        className="w-40 rounded bg-white p-2 [&>svg]:h-auto [&>svg]:w-full"
        role="img"
        aria-label={`QR code for ${url}`}
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
      <div className="flex gap-2">
        <Button onClick={downloadSvg} disabled={!svg}>
          SVG
        </Button>
        <Button onClick={() => void downloadPng()}>PNG</Button>
      </div>
    </Card>
  );
}
