// Helper to click boss sections - add to page temporarily
function testBossSection(sectionName) {
    const items = document.querySelectorAll('#bossDashboard .nav-item');
    for(const item of items) {
        const onclick = item.getAttribute('onclick');
        if(onclick && onclick.includes("'" + sectionName + "'")) {
            item.click();
            return true;
        }
    }
    return false;
}
