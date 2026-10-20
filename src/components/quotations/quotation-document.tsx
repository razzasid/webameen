// biome-ignore-all lint/a11y/noNoninteractiveTabindex: The scrollable quotation table needs keyboard focus.
import { Box, FileText, Info, Mail, MapPin, Phone, UserRound } from "lucide-react";
import localFont from "next/font/local";
import Image from "next/image";
import { Fragment, type ReactNode } from "react";
import { formatPaise } from "@/server/modules/catalog/validation";
import type { QuotationDocument } from "@/server/modules/quotations/document-model";
import {
  componentAmountMinor,
  formatQuotationDate,
  formatQuotationQuantity,
  quotationGstLabel,
  quotationPaymentDetails,
  quotationPriceNote,
  quotationSupplyDetails,
  quotationTotalRows,
  splitQuotationDescription,
} from "@/server/modules/quotations/document-presentation";
import { resolveQuotationHeadings } from "@/server/modules/quotations/template-headings";
import styles from "./quotation-document.module.css";

const quotationFont = localFont({
  src: [
    { path: "../../server/assets/fonts/NotoSans-Regular.ttf", weight: "400" },
    { path: "../../server/assets/fonts/NotoSans-Bold.ttf", weight: "700" },
  ],
  variable: "--font-quotation",
  display: "swap",
});

function Contact({ icon, value }: { icon: ReactNode; value: string | null }) {
  if (!value) return null;
  return (
    <div className={styles.contactRow}>
      {icon}
      <span>{value}</span>
    </div>
  );
}

export function QuotationDocumentView({
  quotation: quote,
  acceptance,
  notice,
}: {
  quotation: QuotationDocument;
  acceptance?: ReactNode;
  notice?: ReactNode;
}) {
  const seller = quote.seller;
  const headings = resolveQuotationHeadings(quote.headings);
  const buyer = quote.buyer;
  const payments = quotationPaymentDetails(quote);
  const hasTerms = Boolean(quote.document.terms || payments.length);

  return (
    <article
      className={`${styles.document} ${quotationFont.variable}`}
      aria-label={`Quotation ${quote.reference}`}
    >
      <header className={styles.header}>
        <svg
          className={styles.decoration}
          viewBox="0 0 420 180"
          fill="none"
          aria-hidden="true"
        >
          <path d="M160 180C246 148 242 34 420 0V180H160Z" fill="#dcefe7" />
          <path
            d="M115 180C172 170 202 137 207 88C157 99 148 151 115 180Z"
            fill="#e1f1e9"
          />
          <path d="M238 180C302 128 356 119 420 153V180H238Z" fill="#d4eade" />
        </svg>
        <div className={styles.brand}>
          {seller.logo_url ? (
            <Image
              className={styles.logo}
              src={seller.logo_url}
              alt={`${seller.display_name} logo`}
              width={260}
              height={88}
              unoptimized
            />
          ) : (
            <div className={styles.brandName}>{seller.display_name}</div>
          )}
        </div>
        <div className={styles.sellerContact}>
          <Contact icon={<MapPin size={17} aria-hidden="true" />} value={seller.address} />
          <Contact icon={<Phone size={17} aria-hidden="true" />} value={seller.phone} />
          <Contact icon={<Mail size={17} aria-hidden="true" />} value={seller.email} />
          <Contact
            icon={<FileText size={17} aria-hidden="true" />}
            value={seller.gst_registered && seller.gstin ? `GSTIN: ${seller.gstin}` : null}
          />
        </div>
      </header>

      <div className={styles.body}>
        <h1 className={styles.title}>{headings.documentTitle}</h1>
        <p className={styles.subtitle}>Prepared for your review.</p>
        <div className={styles.divider} />
        <section className={styles.metadata} aria-label="Quotation and buyer details">
          <dl className={styles.reference}>
            <dt>Quotation No.</dt>
            <dd>{quote.reference}</dd>
            <dt>Version</dt>
            <dd>{quote.version_number}</dd>
            <dt>Valid until</dt>
            <dd>{formatQuotationDate(quote.valid_until)}</dd>
            <dt>Status</dt>
            <dd className="capitalize">{quote.state.replaceAll("_", " ")}</dd>
          </dl>
          <div className={styles.billTo}>
            <h2 className={styles.eyebrow}>{headings.customerTitle}</h2>
            <div className={styles.buyerContact}>
              <div className={styles.contactRow}>
                <UserRound size={19} aria-hidden="true" />
                <div className={styles.buyerName}>
                  {buyer.display_name}
                  {buyer.contact_name ? (
                    <span className={styles.buyerSecondary}>{buyer.contact_name}</span>
                  ) : null}
                </div>
              </div>
              <Contact
                icon={<MapPin size={17} aria-hidden="true" />}
                value={buyer.billing_address}
              />
              <Contact icon={<Phone size={17} aria-hidden="true" />} value={buyer.phone} />
              <Contact icon={<Mail size={17} aria-hidden="true" />} value={buyer.email} />
              <Contact
                icon={<FileText size={17} aria-hidden="true" />}
                value={
                  buyer.gstin_applicable && buyer.gstin ? `GSTIN: ${buyer.gstin}` : null
                }
              />
            </div>
          </div>
        </section>

        <section className={styles.details} aria-label="Supply and tax details">
          <div className={styles.detailsIcon}>
            <FileText size={25} aria-hidden="true" />
          </div>
          <div>
            <h2 className={styles.detailsTitle}>{headings.detailsTitle}</h2>
            <p className={styles.detailsText}>{quotationSupplyDetails(quote).join("\n")}</p>
          </div>
        </section>
        {notice ? <div className={styles.notice}>{notice}</div> : null}

        <section
          className={styles.tableViewport}
          aria-label="Quotation line items"
          tabIndex={0}
        >
          <table className={styles.items}>
            <colgroup>
              <col style={{ width: "6%" }} />
              <col style={{ width: "33%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "15%" }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">{headings.itemDescription}</th>
                <th scope="col">HSN/SAC</th>
                <th scope="col">Qty</th>
                <th scope="col">Unit price</th>
                <th scope="col">GST</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line) => {
                const description = splitQuotationDescription(line.description);
                const gst = quotationGstLabel(line);
                const taxes = [
                  line.gst_rate !== null
                    ? `Taxable ${formatPaise(line.taxable_amount_minor)}`
                    : null,
                  BigInt(line.cgst_amount_minor) !== BigInt(0)
                    ? `CGST ${formatPaise(line.cgst_amount_minor)}`
                    : null,
                  BigInt(line.sgst_amount_minor) !== BigInt(0)
                    ? `SGST ${formatPaise(line.sgst_amount_minor)}`
                    : null,
                  BigInt(line.igst_amount_minor) !== BigInt(0)
                    ? `IGST ${formatPaise(line.igst_amount_minor)}`
                    : null,
                ].filter(Boolean);
                return (
                  <Fragment key={line.position}>
                    <tr>
                      <td>{line.position}</td>
                      <td>
                        <span className={styles.lineTitle}>{description.title}</span>
                        {description.detail ? (
                          <div className={styles.lineDetail}>{description.detail}</div>
                        ) : null}
                      </td>
                      <td>{line.hsn_sac ?? "—"}</td>
                      <td>
                        {formatQuotationQuantity(line.quantity)}
                        {line.unit_label ? (
                          <span className={styles.secondary}>{line.unit_label}</span>
                        ) : null}
                      </td>
                      <td className={styles.amount}>
                        {formatPaise(line.unit_price_minor)}
                      </td>
                      <td>
                        {gst.rate}
                        {gst.treatment ? (
                          <span className={styles.secondary}>({gst.treatment})</span>
                        ) : null}
                      </td>
                      <td className={styles.amount}>
                        {formatPaise(line.line_total_minor)}
                      </td>
                    </tr>
                    {taxes.length ? (
                      <tr>
                        <td colSpan={7} className={styles.taxDetailCell}>
                          {taxes.join(" · ")}
                        </td>
                      </tr>
                    ) : null}
                    {line.components.length ? (
                      <tr>
                        <td colSpan={7} className={styles.componentsCell}>
                          <div className={styles.materials}>
                            <div className={styles.materialsHeading}>
                              <Box size={23} aria-hidden="true" />
                              <div>
                                <h3>{headings.materialsTitle}</h3>
                                <p>
                                  Breakdown only — these amounts are not added to the
                                  quotation total.
                                </p>
                              </div>
                            </div>
                            <table
                              className={styles.materialsTable}
                              aria-label={`Materials for item ${line.position}`}
                            >
                              <colgroup>
                                <col style={{ width: "6%" }} />
                                <col style={{ width: "42%" }} />
                                <col style={{ width: "12%" }} />
                                <col style={{ width: "20%" }} />
                                <col style={{ width: "20%" }} />
                              </colgroup>
                              <thead>
                                <tr>
                                  <th scope="col">#</th>
                                  <th scope="col">Item</th>
                                  <th scope="col">Qty</th>
                                  <th scope="col" className={styles.amount}>
                                    Rate
                                  </th>
                                  <th scope="col" className={styles.amount}>
                                    Amount
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {line.components.map((component) => (
                                  <tr key={component.position}>
                                    <td>{component.position}</td>
                                    <td>{component.description}</td>
                                    <td>
                                      {formatQuotationQuantity(component.quantity)}
                                      {component.unit_label ? (
                                        <span className={styles.secondary}>
                                          {component.unit_label}
                                        </span>
                                      ) : null}
                                    </td>
                                    <td className={styles.amount}>
                                      {formatPaise(component.unit_price_minor)}
                                    </td>
                                    <td className={styles.amount}>
                                      {formatPaise(
                                        componentAmountMinor(
                                          component.quantity,
                                          component.unit_price_minor,
                                        ),
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className={styles.summary} aria-label="Quotation totals">
          <p className={styles.priceNote}>
            <Info size={18} aria-hidden="true" />
            {quotationPriceNote(quote)}
          </p>
          <div className={styles.totals}>
            <dl>
              {quotationTotalRows(quote).map((row) => (
                <Fragment key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{formatPaise(row.value)}</dd>
                </Fragment>
              ))}
            </dl>
            <div className={styles.grandTotal}>
              <span>
                {headings.totalTitle} ({quote.document.currency_code})
              </span>
              <strong>{formatPaise(quote.totals.total_minor)}</strong>
            </div>
          </div>
        </section>

        <div className={styles.bottom}>
          {hasTerms ? (
            <div className={styles.terms}>
              {quote.document.terms ? (
                <section>
                  <h2 className={styles.sectionTitle}>{headings.termsTitle}</h2>
                  <p className={styles.termsText}>{quote.document.terms}</p>
                </section>
              ) : null}
              {payments.length ? (
                <section className={styles.payment}>
                  <h2 className={styles.sectionTitle}>{headings.paymentTitle}</h2>
                  <p className={styles.termsText}>{payments.join("\n")}</p>
                </section>
              ) : null}
            </div>
          ) : null}
          <section
            className={`${styles.acceptance} ${!hasTerms ? styles.acceptanceOnly : ""}`}
          >
            <h2 className={styles.sectionTitle}>{headings.acceptanceTitle}</h2>
            <div className={styles.acceptanceCard}>
              <p className={styles.acceptanceText}>
                Please review this quotation and confirm your response.
              </p>
              {acceptance ?? (
                <div className={styles.signature}>
                  <span>Signature over printed name</span>
                  <span>Date</span>
                </div>
              )}
              {acceptance ? (
                <div className={styles.printAcceptance}>
                  <div className={styles.signature}>
                    <span>Signature over printed name</span>
                    <span>Date</span>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerContacts}>
            <Contact
              icon={<MapPin size={14} aria-hidden="true" />}
              value={seller.address}
            />
            <Contact icon={<Phone size={14} aria-hidden="true" />} value={seller.phone} />
            <Contact icon={<Mail size={14} aria-hidden="true" />} value={seller.email} />
          </div>
          <p className={styles.thankYou}>Thank you for your business!</p>
        </footer>
      </div>
    </article>
  );
}
