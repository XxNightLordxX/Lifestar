
/**
 * Loading indicator helper
 */
const LoadingIndicator = {
    show: function(message = 'Loading...') {
        let loader = document.getElementById('global-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'global-loader';
            loader.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99999;';
            loader.innerHTML = '<div style="background:white;padding:2rem;border-radius:8px;text-align:center;"><div style="width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #007bff;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 1rem;"></div><div id="loader-message">' + message + '</div></div>';
            document.body.appendChild(loader);
        } else {
            document.getElementById('loader-message').textContent = message;
            loader.style.display = 'flex';
        }
    },
    
    hide: function() {
        const loader = document.getElementById('global-loader');
        if (loader) {
            loader.style.display = 'none';
        }
    }
};

// Add spin animation if not exists
if (!document.getElementById('spin-animation')) {
    const style = document.createElement('style');
    style.id = 'spin-animation';
    style.textContent = '@keyframes spin {0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}';
    document.head.appendChild(style);
}
