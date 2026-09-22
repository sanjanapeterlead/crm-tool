export interface WhatsAppBusiness {
  id: string;
  name: string;
}

/** A WhatsApp Business Account (WABA), owned by a Business. */
export interface WhatsAppBusinessAccount {
  id: string;
  name: string;
}

/** A sending number registered under a WABA. */
export interface WhatsAppPhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating?: string;
}

export type WhatsAppTemplateComponentType = "HEADER" | "BODY" | "FOOTER" | "BUTTONS";

export interface WhatsAppTemplateComponent {
  type: WhatsAppTemplateComponentType;
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
  text?: string;
  buttons?: Array<{ type: string; text: string }>;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category?: string;
  status: string;
  components: WhatsAppTemplateComponent[];
}

export interface WhatsAppSendResponse {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface WhatsAppErrorResponse {
  error?: {
    message: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_data?: { details?: string };
    fbtrace_id?: string;
  };
}
