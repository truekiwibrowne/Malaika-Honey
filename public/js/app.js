import './lib/firebase.js';
import { addRoute, startRouter } from './router.js';
import { initOfflineBanner } from './lib/ui.js';

import { renderHome } from './screens/home.js';
import { renderNewFarmer, renderNewFarmerSuccess } from './screens/newFarmer.js';
import { renderFindFarmer } from './screens/findFarmer.js';
import { renderFarmerProfile } from './screens/farmerProfile.js';
import { renderBuyProduce, renderBuyProduceSuccess } from './screens/buyProduce.js';
import { renderHistory } from './screens/history.js';
import { renderCard } from './screens/card.js';

const root = document.getElementById('screen-root');

addRoute('/home', () => renderHome(root));
addRoute('/new-farmer', () => renderNewFarmer(root));
addRoute('/new-farmer/success/:frn', (params) => renderNewFarmerSuccess(root, params));
addRoute('/find-farmer', (params, query) => renderFindFarmer(root, query));
addRoute('/farmer/:frn', (params) => renderFarmerProfile(root, params));
addRoute('/buy/:frn', (params) => renderBuyProduce(root, params));
addRoute('/buy/:frn/success/:purchaseId', (params) => renderBuyProduceSuccess(root, params));
addRoute('/history/:frn', (params) => renderHistory(root, params));
addRoute('/card/:frn', (params) => renderCard(root, params));

initOfflineBanner();
startRouter();
