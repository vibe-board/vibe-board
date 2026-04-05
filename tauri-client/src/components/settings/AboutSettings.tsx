import { useTranslation } from 'react-i18next';
import { useSystemInfo } from '@/api/hooks/useConfig';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function AboutSettings() {
  const { t } = useTranslation();
  const { data, isLoading } = useSystemInfo();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.about')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {t('settings.appVersion')}
            </p>
            <p className="text-sm font-medium">
              {data?.config?.config_version ?? '—'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {t('settings.appDescription')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
