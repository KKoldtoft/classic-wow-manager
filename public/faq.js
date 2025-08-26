document.addEventListener('DOMContentLoaded', () => {
    const accordion = document.getElementById('faqAccordion');
    if (!accordion) return;

    function expand(item) {
        const answer = item.querySelector('.faq-answer');
        if (!answer) return;
        const inner = answer.querySelector('.faq-answer-inner');
        // Ensure starting state
        answer.style.height = '0px';
        item.classList.add('open');
        // Next frame, measure full height (with padding) and animate
        requestAnimationFrame(() => {
            const fullHeight = inner ? inner.offsetHeight : answer.scrollHeight;
            answer.style.height = fullHeight + 'px';
        });

        const onEnd = (ev) => {
            if (ev.propertyName !== 'height') return;
            answer.removeEventListener('transitionend', onEnd);
            // Lock to auto to accommodate future content size changes
            answer.style.height = 'auto';
        };
        answer.addEventListener('transitionend', onEnd);
    }

    function collapse(item) {
        const answer = item.querySelector('.faq-answer');
        if (!answer) return;
        const inner = answer.querySelector('.faq-answer-inner');
        // From auto to fixed px for smooth transition start
        const currentHeight = inner ? inner.offsetHeight : answer.scrollHeight;
        answer.style.height = currentHeight + 'px';
        // Next frame, animate to 0 while keeping padding (keep 'open' during transition)
        requestAnimationFrame(() => {
            answer.style.height = '0px';
        });

        const onEnd = (ev) => {
            if (ev.propertyName !== 'height') return;
            answer.removeEventListener('transitionend', onEnd);
            // After collapse completes, remove open state and cleanup
            item.classList.remove('open');
            answer.style.height = '';
        };
        answer.addEventListener('transitionend', onEnd);
    }

    accordion.addEventListener('click', (e) => {
        const btn = e.target.closest('.faq-question');
        if (!btn) return;

        const item = btn.closest('.faq-item');
        if (!item) return;

        // Close other open items with animation
        accordion.querySelectorAll('.faq-item.open').forEach(openItem => {
            if (openItem !== item) collapse(openItem);
        });

        if (item.classList.contains('open')) {
            collapse(item);
        } else {
            expand(item);
        }
    });
});


