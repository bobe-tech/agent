import { useNavigate } from 'react-router-dom';
import { Button, Typography } from '@heroui/react';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center"
      data-testid="not-found-root"
    >
      {/* Decorative "404" — h1 visual scale, aria-hidden so the only heading is the real <h1> below.
          HeroUI typography classes on native tags, since Typography's render prop can't swap the element. */}
      <div aria-hidden className="typography typography--h1 text-muted">
        404
      </div>
      <h1 className="typography typography--h4">Page not found</h1>
      <Typography.Paragraph color="muted" className="max-w-md">
        The page you’re looking for doesn’t exist or has been moved.
      </Typography.Paragraph>
      <Button variant="secondary" onPress={() => navigate('/')}>
        Back to dashboard
      </Button>
    </div>
  );
}
