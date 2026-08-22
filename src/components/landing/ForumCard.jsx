import { MessageSquare, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

export default function ForumCard() {
  const { t } = useLanguage();
  return (
    <section className="px-5 py-6">
      <div className="ip-surface border border-border rounded-xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center shrink-0">
            <MessageSquare className="w-5 h-5 ip-accent" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="ip-text font-semibold text-sm">{t.communityForum}</h3>
              <span className="px-2 py-0.5 rounded bg-secondary text-muted-foreground text-[10px] font-medium tracking-wide">{t.comingSoon}</span>
            </div>
            <p className="ip-muted text-xs leading-relaxed mt-1.5">
              {t.forumDescription}
            </p>
          </div>
        </div>
        <button className="w-full flex items-center justify-center gap-2 border border-border rounded-lg py-2.5 ip-text text-sm font-medium hover:bg-secondary transition-colors">
          {t.enterForum} <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}