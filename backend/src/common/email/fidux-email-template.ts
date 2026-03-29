type FiduxEmailFact = {
    label: string;
    value: string;
};

export type FiduxEmailTemplateInput = {
    preheader: string;
    badge: string;
    title: string;
    intro: string;
    facts: FiduxEmailFact[];
    ctaLabel: string;
    ctaUrl: string;
    helperText?: string;
    footerNote?: string;
};

function escapeHtml(input: string) {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderFiduxEmailHtml(input: FiduxEmailTemplateInput) {
    const factsHtml = input.facts
        .map(
            (fact) => `
                <tr>
                    <td style="padding: 0 0 12px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
                            <tr>
                                <td style="padding: 12px 14px; border: 1px solid #d7dbff; border-radius: 14px; background: #f7f9ff;">
                                    <div style="font-size: 11px; line-height: 1.2; letter-spacing: 0.08em; text-transform: uppercase; color: #6b5cff; font-weight: 700; margin-bottom: 6px;">
                                        ${escapeHtml(fact.label)}
                                    </div>
                                    <div style="font-size: 15px; line-height: 1.45; color: #111827; font-weight: 700;">
                                        ${escapeHtml(fact.value)}
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            `,
        )
        .join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#070b14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(input.preheader)}
  </span>

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding:28px 12px;background:#070b14;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#ffffff;border:1px solid #1f2a44;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(6,8,22,0.38);">
          <tr>
            <td style="padding:0;background:#0a0f1e;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="width:33.33%;height:5px;background:#2dd4bf;"></td>
                  <td style="width:33.33%;height:5px;background:#7c3aed;"></td>
                  <td style="width:33.33%;height:5px;background:#db2777;"></td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:24px 24px 22px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                      <tr>
                        <td style="padding-right:14px;vertical-align:middle;">
                          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:4px;">
                            <tr>
                              <td style="width:18px;height:18px;border-radius:4px;background:#2dd4bf;"></td>
                              <td style="width:18px;height:18px;border-radius:4px;background:#5b8cff;"></td>
                            </tr>
                            <tr>
                              <td style="width:18px;height:18px;border-radius:4px;background:#14b8a6;"></td>
                              <td style="width:18px;height:18px;border-radius:4px;background:#db2777;"></td>
                            </tr>
                          </table>
                        </td>
                        <td style="vertical-align:middle;">
                          <div style="font-size:34px;line-height:1;font-weight:900;letter-spacing:-0.04em;color:#ffffff;">fidux</div>
                          <div style="margin-top:10px;display:inline-block;padding:7px 12px;border-radius:999px;background:#101934;border:1px solid #2a3968;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#d4d9ff;">
                            ${escapeHtml(input.badge)}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px;background:#ffffff;">
              <div style="height:18px;border-radius:0 0 18px 18px;background:linear-gradient(90deg, rgba(45,212,191,0.16) 0%, rgba(124,58,237,0.14) 52%, rgba(219,39,119,0.16) 100%);"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 24px 24px;background:#ffffff;">
              <h1 style="margin:0 0 10px;font-size:28px;line-height:1.2;color:#0f172a;letter-spacing:-0.03em;">${escapeHtml(input.title)}</h1>
              <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#475569;">
                ${escapeHtml(input.intro)}
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;border-collapse:collapse;">
                ${factsHtml}
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
                <tr>
                  <td align="center" bgcolor="#db2777" style="border-radius:14px;box-shadow:0 10px 24px rgba(219,39,119,0.26);">
                    <a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;padding:12px 18px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">
                      ${escapeHtml(input.ctaLabel)}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#64748b;">
                ${escapeHtml(input.helperText || 'If the button does not work, copy and paste this link in your browser:')}
              </p>
              <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#0f172a;word-break:break-all;">
                <a href="${escapeHtml(input.ctaUrl)}" style="color:#6b5cff;text-decoration:underline;font-weight:600;">
                  ${escapeHtml(input.ctaUrl)}
                </a>
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 14px;">
                <tr>
                  <td style="height:1px;background:#e8ebff;"></td>
                </tr>
              </table>
              <p style="margin:0;font-size:12px;line-height:1.7;color:#6b7280;">
                ${escapeHtml(
                    input.footerNote ||
                        'You received this email because of activity in your Fidux workspace.',
                )}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
}

export function renderFiduxEmailText(input: FiduxEmailTemplateInput) {
    const facts = input.facts.map((fact) => `${fact.label}: ${fact.value}`).join('\n');
    return [
        `Fidux - ${input.badge}`,
        '',
        input.title,
        input.intro,
        '',
        facts,
        '',
        `${input.ctaLabel}: ${input.ctaUrl}`,
        '',
        input.helperText || 'If the button does not work, copy and paste this link in your browser.',
        input.ctaUrl,
        '',
        input.footerNote || 'You received this email because of activity in your Fidux workspace.',
    ].join('\n');
}
