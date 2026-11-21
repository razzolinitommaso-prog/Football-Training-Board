export type AuditCase={path:string;role:string;name:string};
export const auditCases:AuditCase[];
export const auditWidths:number[];
export function inspectLayout(tab:{playwright:{evaluate:Function}}):Promise<{viewport:number;documentWidth:number;overflow:unknown[];narrow:unknown[];renderError:boolean;headings:string[];bodyLength:number}>;
