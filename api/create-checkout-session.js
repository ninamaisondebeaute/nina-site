// Fonction serveur (Vercel) : construit une session de paiement Stripe
// à partir du panier envoyé par le site, avec les prix RECALCULÉS ICI
// (jamais depuis le navigateur) pour éviter toute manipulation de prix.

const Stripe = require('stripe');

// Catalogue officiel — seule source de vérité pour les prix.
// Pour changer un prix ou ajouter un produit : modifier cette liste uniquement.
const CATALOG = {
  // MONOÏ (Moana - Fleur de Tiaré)
  'moana-gel-douche':  { name: 'Gel douche Moana 300ml',              price: 1490 },
  'moana-creme-corps': { name: 'Crème Corps Moana 212ml',             price: 3190 },
  'moana-huile-corps': { name: 'Huile Corps Moana 50ml',              price: 2090 },
  'moana-brume-corps': { name: 'Brume Corps Moana 125ml',             price: 2290 },
  'moana-bougie':      { name: 'Bougie Moana 180gr',                  price: 2690 },
  'moana-edp':         { name: 'Eau de Parfum Moana 15ml',            price: 1990 },

  // LOST PARADISE (Ananas des Antipodes)
  'lost-gel-douche':   { name: 'Gel douche Lost Paradise 300ml',      price: 1490 },
  'lost-creme-corps':  { name: 'Crème Corps Lost Paradise 170ml',     price: 3190 },
  'lost-huile-corps':  { name: 'Huile Corps Lost Paradise 50ml',      price: 2090 },
  'lost-brume-corps':  { name: 'Brume Corps Lost Paradise 125ml',     price: 2290 },
  'lost-bougie':       { name: 'Bougie Lost Paradise 180gr',          price: 2690 },
  'lost-edp':          { name: 'Eau de Parfum Lost Paradise 15ml',    price: 1990 },

  // MINUIT CHÉRI (Tubéreuse Envoûtante)
  'minuit-gel-douche': { name: 'Gel Douche Minuit Chéri 200ml',       price: 1290 },
  'minuit-creme-corps':{ name: 'Crème Corps Velours Minuit Chéri 175ml', price: 2790 },
  'minuit-huile-corps':{ name: 'Huile Corps Minuit Chéri 50ml',       price: 2090 },
  'minuit-brume-corps':{ name: 'Brume Corps Minuit Chéri 125ml',      price: 2290 },
  'minuit-bougie':     { name: 'Bougie Minuit Chéri 180gr',           price: 2690 },
  'minuit-edp':        { name: 'Eau de Parfum Minuit Chéri 15ml',     price: 1990 },

  // SWEET DREAMS (Figue, Noix de Coco & Ambre)
  'sweet-edp':         { name: 'Eau de Parfum Sweet Dreams 15ml',     price: 1990 },
  'sweet-coffret':     { name: 'Coffret Cosy Home Sweet Dreams',      price: 2490 },
};

module.exports = async (req, res) => {
  // CORS basique (utile si le site et l'API ne sont jamais séparés, sinon inoffensif)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }

  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      res.status(500).json({ error: 'Clé Stripe non configurée sur le serveur (variable STRIPE_SECRET_KEY manquante).' });
      return;
    }
    const stripe = Stripe(stripeSecretKey);

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const items = body && body.items;
    const origin = (body && body.origin) || req.headers.origin || '';

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Panier vide.' });
      return;
    }
    if (!origin) {
      res.status(400).json({ error: 'Origine du site manquante.' });
      return;
    }

    // On regroupe les articles identiques et on limite les quantités abusives
    const grouped = {};
    for (const item of items) {
      const id = item && item.id;
      if (!CATALOG[id]) continue; // on ignore silencieusement tout id inconnu
      const qty = Math.min(Math.max(parseInt(item.qty, 10) || 1, 1), 20);
      grouped[id] = (grouped[id] || 0) + qty;
    }

    const line_items = Object.keys(grouped).map((id) => {
      const product = CATALOG[id];
      return {
        price_data: {
          currency: 'eur',
          product_data: { name: product.name },
          unit_amount: product.price, // en centimes
        },
        quantity: grouped[id],
      };
    });

    if (line_items.length === 0) {
      res.status(400).json({ error: 'Aucun produit valide dans le panier.' });
      return;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      shipping_address_collection: { allowed_countries: ['FR'] },
      success_url: origin + '/merci.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: origin + '/#boutique',
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Erreur serveur.' });
  }
};
