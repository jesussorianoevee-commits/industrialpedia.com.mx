import { MessageSquare, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

export default function ForumCard() {
  const { t } = useLanguage();
  return (
    <section className="px-3 sm:px-5 py-2 sm:py-4 max-w-5xl mx-auto w-full">
      <div className="ip-surface border border-border/80 rounded-[24px] p-5 sm:p-6 shadow-[0_18px_45px_-38px_rgba(0,0,0,.6)]">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
            <MessageSquare className="w-5 h-5 ip-accent" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="ip-text font-semibold text-base">{t.communityForum}</h3>
              <span className="px-2.5 py-1 rounded-full bg-secondary border border-border/70 text-muted-foreground text-[10px] font-medium tracking-wide">{t.comingSoon}</span>
            </div>
            <p className="ip-muted text-xs sm:text-sm leading-relaxed mt-1.5 max-w-2xl">
              {t.forumDescription}
            </p>
          </div>
        </div>
        <button className="w-full flex items-center justify-center gap-2 border border-border rounded-xl py-3 ip-text text-sm font-medium hover:bg-secondary hover:border-primary/30 transition-colors">
          {t.enterForum} <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}