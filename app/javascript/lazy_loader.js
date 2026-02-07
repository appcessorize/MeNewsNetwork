// Lazy loader for page-specific JavaScript
// Defers module loading until after page becomes interactive

const lazyLoad = (moduleName) => {
  // Use requestIdleCallback if available, otherwise setTimeout
  const scheduleLoad = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      scheduleLoad(() => import(moduleName));
    });
  } else {
    scheduleLoad(() => import(moduleName));
  }
};

// Export for use in inline scripts
window.lazyLoadModule = lazyLoad;

export { lazyLoad };
