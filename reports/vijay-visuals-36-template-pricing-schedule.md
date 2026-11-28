# VIJAY VISUALS — Final One-Time Pricing Schedule for All 36 Website Templates

Date: 2026-11-28
Branch: `preview/vijay-visuals-p0-safe-2026-11-26`
Status: **Approved Preview source/report release. Not written to D1, not activated.** Prices remain display-only. The schedule report is committed in `f58728b`; the customer-experience display source is part of this Preview-only release.

---

## 1. Purpose and boundary

This document is the proposed final one-time price schedule for the 36 template SKUs in `src/lib/templatesData.ts`. It is a planning/report artefact only.

- These are **one-time template prices**, not website packages, subscriptions, hosting plans, payment-gateway accounts or service contracts.
- No price in this schedule has been written to `subscription_plans`, no SKU has been activated, and the marketplace continues to read only server-configured values.
- The schedule uses only the approved customer-friendly price levels: **₹999, ₹1,499, ₹1,999, ₹2,499, ₹3,499 and ₹4,999**.
- Prices were assigned by actual design complexity, the number and depth of listed features, and the business use case. Simple small-business and content-led designs stay affordable; advanced commerce, booking, calculator, 360-view, high-value and integration-led designs are priced higher.

---

## 2. Price basis

| Design class | Price | Typical basis |
| --- | ---: | --- |
| Essential | ₹999 | Content-led portfolio, inquiry or simple service brochure with limited interactivity. |
| Standard | ₹1,499 | Small local-business catalogue or service page with one to three light customisations or booking controls. |
| Intermediate | ₹1,999 | Mid-depth commerce/service flows with calculators, comparison, trackers or multiple booking paths. |
| Advanced | ₹2,499 | High-consideration commerce or planning flows with multiple tools, rich product data or configuration. |
| Premium | ₹3,499 | High-stakes service inventory, premium visual treatment, 360 views, secure/trust-led multi-step flows. |
| Enterprise | ₹4,999 | Highest build complexity: modular sections, B2B modes, custom fields and API/webhook extension points. |

---

## 3. Complete 36-template pricing schedule

<!-- PRICING_SCHEDULE_START -->
| # | Template name | SKU | Category | Design class | One-time price | Reason |
| ---: | --- | --- | --- | --- | ---: | --- |
| 1 | Sri Krishna Kirana & Daily Provisions | tpl-grocery-store | Grocery Store | Standard | ₹1,499 | Neighbourhood catalogue with weight/unit customizer, WhatsApp list upload and monthly basket; small-shop scope, no deep checkout pipeline. |
| 2 | MegaMart Hypermarket & Foods | tpl-supermarket | Supermarket | Intermediate | ₹1,999 | High-volume multi-aisle catalogue, loyalty points, bulk tiers and barcode search; more catalogue logic than a basic shop. |
| 3 | Vastra Heritage Men & Women Apparel | tpl-clothing-store | Clothing Store | Standard | ₹1,499 | Apparel catalogue with size guide, fabric specs, trial-at-home and alteration notes; moderate variants, simple selling flow. |
| 4 | Vogue Silk & Designer Couture | tpl-fashion-boutique | Fashion Boutique | Advanced | ₹2,499 | Bridal/couture visual design plus custom work estimator, video fitting slot, swatch picker and trousseau packages; high-touch configuration. |
| 5 | Apex Mobile World & Smart Gadgets | tpl-mobile-store | Mobile Store | Intermediate | ₹1,999 | Gadgets catalogue with exchange valuation, EMI calculator, warranty badges and metro delivery; two calculators raise complexity. |
| 6 | ElectroVision Home Appliances & TV | tpl-electronics-store | Electronics Store | Intermediate | ₹1,999 | Appliances catalogue with spec comparison, installation booking, extended warranty and same-day unboxing; structured product data. |
| 7 | Sanjeevani Medico & Surgical Essentials | tpl-medical-store | Medical Store | Advanced | ₹2,499 | Prescription upload, pharmacist line, emergency delivery and cold-chain handling; compliance-sensitive workflow and trust UI. |
| 8 | Aura Care Chemist & Wellness | tpl-pharmacy | Pharmacy | Advanced | ₹2,499 | Refill automation, cold-chain insulin scheduling, generic cost saver and timed delivery; recurring-care logic beyond a simple catalogue. |
| 9 | Prana Multispeciality Hospital & Diagnostic Clinic | tpl-hospital-clinic | Hospital and Clinic | Premium | ₹3,499 | Doctor slot booking, lab sample collection, digital reports vault and ambulance dispatch; multiple high-stakes service flows and careful information design. |
| 10 | Royal Feast Cloud Kitchen & Restaurant | tpl-restaurant | Restaurant | Intermediate | ₹1,999 | Dine-in QR menu, WhatsApp ordering, delivery-time calculator and spice filter; dual dine-in and delivery paths. |
| 11 | SpiceRoute Express Cloud Kitchen & Delivery | tpl-cloud-kitchen | Cloud Kitchen | Standard | ₹1,499 | Delivery-first menu with combo/tiffin packs, quick reorder and prep-time indicator; narrow catalogue, simple direct ordering. |
| 12 | Grand Heritage Palace Hotel & Suites | tpl-hotel | Hotel | Premium | ₹3,499 | Room availability engine, banquet booking, 360 suite walkthrough and in-room dining; hospitality inventory and rich media. |
| 13 | Velvet Crumbs Artisan Bakery & Pastry | tpl-bakery | Bakery | Standard | ₹1,499 | Custom photo/message cake, midnight slot, eggless/vegan filter and sweet-box combos; personalisation without deep commerce. |
| 14 | Kalyan Heritage Gold & Diamond Atelier | tpl-jewellery-store | Jewellery Store | Premium | ₹3,499 | Live gold-rate banner, 360 solitaire viewer, VIP video consultation and hallmark verification; premium visual treatment plus trust checks. |
| 15 | Frame & Light Portrait Photography | tpl-photography-studio | Portrait & Event Photography | Essential | ₹999 | Portrait booking, proofing gallery, package list and inquiry form; service brochure with light interactivity. |
| 16 | Frame Forward Creator Portfolio | tpl-video-editing-studio | Creator Video Portfolio | Essential | ₹999 | Portfolio gallery, service packages, quote request and project update page; content-led creator site. |
| 17 | Royal Moments Wedding Photography | tpl-wedding-photography | Wedding Photography Business | Essential | ₹999 | Wedding date inquiry, package prices, gallery preview and booking calendar; focused lead-capture design. |
| 18 | Shree Utsav Royal Wedding & Corporate Events | tpl-event-management | Event Management | Advanced | ₹2,499 | Budget estimator, 3D decor concepts, catering customizer and coordinator booking; multiple planning tools in one flow. |
| 19 | Apex Luxury Villas & Prime Real Estate | tpl-real-estate | Real Estate | Advanced | ₹2,499 | Interactive floor plans, EMI calculator, brochure download and map coordinates; high-value property discovery tools. |
| 20 | SpeedCraft Luxury Cars & Pre-Owned Motors | tpl-automobile-showroom | Automobile Showroom | Advanced | ₹2,499 | Test-drive booking, trade-in valuation, 360 view and loan eligibility checker; high-value catalogue with finance tools. |
| 21 | MotoFix Superbike Care & Custom Garage | tpl-bike-garage | Bike Garage | Intermediate | ₹1,999 | Pickup/drop booking, service packages, job tracker and genuine-parts assurance; service workflow with status tracking. |
| 22 | Luxe Aura Unisex Salon & Makeover Studio | tpl-beauty-salon | Beauty Salon | Intermediate | ₹1,999 | Stylist/seat booking, bridal package estimator, before/after showcase and combos; appointment-led retail-services mix. |
| 23 | Ananda Ayurvedic Wellness Spa & Retreat | tpl-spa-wellness | Spa | Standard | ₹1,499 | Therapy slot booking, oil selection, couples packages and short assessment; calm service site with light configuration. |
| 24 | Spartan Elite Crossfit & Strength Gym | tpl-gym-fitness | Gym and Fitness | Standard | ₹1,499 | Trial pass, trainer slots, BMI/diet estimator and member stories; membership-led brochure with one calculator. |
| 25 | Chanakya IAS & Competitive Academy | tpl-education-coaching | Education and Coaching | Essential | ₹999 | Demo lecture access, PDF syllabus, batch timings and ranker page; content and enrollment enquiries, minimal commerce. |
| 26 | WanderLust Global Holidays & Pilgrimage Tours | tpl-travel-agency | Travel Agency | Advanced | ₹2,499 | Itinerary cost estimator, flight/hotel combos, visa support line and day-by-day schedules; multi-step trip planning interface. |
| 27 | TeakWood Artisans Handcrafted Furniture | tpl-furniture-store | Furniture Store | Advanced | ₹2,499 | Room measurement check, finish/fabric swatches, delivery and assembly notes, and certificate display; high-consideration product configuration. |
| 28 | Sylvan Living Interiors & 3D Modular Spaces | tpl-interior-design | Interior Design | Advanced | ₹2,499 | Room cost estimator, 3D walkthrough gallery, palette board and site-visit booking; visual-heavy consultation funnel. |
| 29 | BuildTech Tools, Paints & Sanitary Hardware | tpl-hardware-store | Hardware Store | Intermediate | ₹1,999 | Contractor wholesale mode, paint quantity calculator, site dispatch and GST invoice fields; trade-oriented commerce logic. |
| 30 | HappyPaws Pet Store & Veterinary Care | tpl-pet-store | Pet Store | Standard | ₹1,499 | Grooming slots, monthly food subscription, vet teleconsultation and diet matcher; retail plus appointment mix at small-shop scale. |
| 31 | Dharti Ratna Organic Farm & Fresh Harvest | tpl-organic-farming | Organic Farming | Standard | ₹1,499 | Farm traceability QR, weekly basket subscription, lab reports and harvest-day delivery; producer-led catalogue with simple subscription. |
| 32 | Prakriti A2 Desi Cow Milk & Dairy | tpl-dairy-business | Dairy Business | Standard | ₹1,499 | Daily milk calendar, WhatsApp pause/resume, lab certificates and farm visit passes; recurring delivery with lightweight controls. |
| 33 | Blossom & Petals Fresh Flowers & Luxury Gifts | tpl-florist-gift-store | Florist and Gift Store | Standard | ₹1,499 | Two-hour delivery, custom card note, luxury presentation and occasion combos; personalisation without complex checkout. |
| 34 | Nyaya Legal & Corporate Tax Advisory | tpl-legal-financial | Legal and Financial Services | Essential | ₹999 | Confidential consultation booking, fixed-fee packages, document checklist and retainer enquiry; advisory lead capture, no transactional catalogue. |
| 35 | Elevate Media Digital Marketing & Growth SEO | tpl-digital-marketing | Digital Marketing Agency | Intermediate | ₹1,999 | Manual metadata/schema checker, ad-spend worksheet, quoted plans and business-owned metrics dashboard; tool-led agency presentation. |
| 36 | Enterprise Bespoke Multi-Tenant Business Portal | tpl-custom-business | Custom Business Template | Enterprise | ₹4,999 | Drag-and-drop sections, B2B/retail modes, custom fields and API/webhook extension points; highest build and integration complexity. |
<!-- PRICING_SCHEDULE_END -->

---

## 4. Separate costs and explicit non-promises

The following disclosures apply to **all 36 rows** above wherever the customer uses the template:

- **Domain name** registration and renewal are separate and are billed by the domain registrar. A domain is not included in any template price.
- **Hosting/deployment**, CDN, storage overages and email accounts are separate infrastructure costs. No template price includes hosting, and no free hosting is promised.
- **Payment gateway/merchant account** approval, gateway charges, MDR, settlement charges and refunds are separate. In Preview, only Sandbox-style testing may be discussed; Live gateway use requires separate approval.
- **Custom development** beyond the listed template features — bespoke sections, extra calculators, API integrations, webhooks, data migration, third-party licences, content creation, photography, paid ads and SEO services — is separately quoted and accepted only as a distinct scope.
- **Ongoing maintenance, updates and support** are governed by the bounded terms recorded on the SKU. After the stated support period, continued maintenance is available only as a separately accepted paid maintenance plan. No unlimited updates, lifetime support or permanent service is promised.
- **Template price vs package price:** the one-time amount above buys the selected template design and its listed in-template features for one website. It is not a recurring subscription, not a website package, not a hosting plan and not a payment gateway.

---

## 5. Catalogue status

| Check | Result |
| --- | ---: |
| Catalogue templates in `src/lib/templatesData.ts` | 36 |
| Rows in this pricing schedule | 36 |
| Unique `tpl-*` SKUs | 36 |
| Missing SKUs | 0 |
| Duplicate SKUs | 0 |
| Rows using an approved price level | 36 / 36 |
| Approved price levels represented | 6 / 6 |
| ₹999 | 5 templates |
| ₹1,499 | 10 templates |
| ₹1,999 | 8 templates |
| ₹2,499 | 9 templates |
| ₹3,499 | 3 templates |
| ₹4,999 | 1 template |
| Sum of proposed one-time list prices | ₹73,964 |
| SKUs activated | 0 |
| Prices written to D1 | 0 |
| Preview/Production deploy | Not performed |
| Production touched | No |

Validation is executable locally with:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run check:template-pricing-schedule
```

The check compares this report against the authoritative catalogue and verifies row count, name/category/SKU matching, unique SKUs, approved price levels and absence of missing or extra rows. It performs no network, D1 or deployment action.

---

## 6. Next step only after separate approval

If and when Owner price configuration is explicitly approved, the stable Preview deployment should first be updated so `GET/PATCH /api/platform-owner/template-pricing` exists. Only then may the Owner enter these proposed one-time prices through the authenticated endpoint. Until that approval, all 36 SKUs must remain inactive and at zero price in Preview D1.
