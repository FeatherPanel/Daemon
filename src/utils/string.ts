export function unicode_utf8(str: string) {
	str = str
		.replaceAll("\u0001", "\r")
		.replaceAll(new RegExp(/\u0000[^\u0000]/, "g"), "")
		.replaceAll("\u0000", "");

	return str;
}
