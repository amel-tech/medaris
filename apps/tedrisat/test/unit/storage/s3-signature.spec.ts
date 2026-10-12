import {
  EMPTY_PAYLOAD_SHA256,
  objectPath,
  sha256Hex,
  signS3Request,
} from "../../../src/storage/s3-signature";

/**
 * MDRS-287: Signature Version 4 as S3 defines it. The credentials, date and
 * the GET example are the S3 documentation's ("Authenticating Requests: Using
 * the Authorization Header", example "GET Object"); the other signatures were
 * computed with botocore's `S3SigV4Auth` (1.34.46) for the same inputs, so
 * the implementation agrees with two references it shares no code with.
 */
const credentials = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};
const now = new Date(Date.UTC(2013, 4, 24));
const region = "us-east-1";

describe("signS3Request (MDRS-287)", () => {
  it("signs the S3 documentation's GET Object example", () => {
    const headers = signS3Request({
      method: "GET",
      url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
      region,
      credentials,
      payloadSha256: EMPTY_PAYLOAD_SHA256,
      headers: { Range: "bytes=0-9" },
      now,
    });
    expect(headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
    );
    expect(headers["x-amz-date"]).toBe("20130524T000000Z");
    expect(headers["x-amz-content-sha256"]).toBe(EMPTY_PAYLOAD_SHA256);
    expect(headers.range).toBe("bytes=0-9");
  });

  it("signs a PUT with its body's hash, as botocore does", () => {
    const headers = signS3Request({
      method: "PUT",
      url: new URL("https://examplebucket.s3.amazonaws.com/test%24file.text"),
      region,
      credentials,
      payloadSha256: sha256Hex("Welcome to Amazon S3."),
      headers: { "x-amz-storage-class": "REDUCED_REDUNDANCY" },
      now,
    });
    expect(headers.authorization).toContain(
      "Signature=1ee3a9a719bf9cd67d34043a52b3d1f8b674e378dc99c0748019b43f49b5b9bb"
    );
  });

  it("signs path-style requests to a Bunny endpoint, as botocore does", () => {
    const put = signS3Request({
      method: "PUT",
      url: new URL(
        `https://de-s3.storage.bunnycdn.com${objectPath("my-zone", "local-dev/courses/a/resources/b")}`
      ),
      region,
      credentials,
      payloadSha256: sha256Hex("%PDF-1.4 hello"),
      headers: { "Content-Type": "application/pdf" },
      now,
    });
    expect(put.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=ec5b5c1ce75ef84b3a2370369a22d1836ac34e56f719d7d62390041dee70fe38"
    );
    const get = signS3Request({
      method: "GET",
      url: new URL(
        `https://de-s3.storage.bunnycdn.com${objectPath("my-zone", "local-dev/x.txt")}`
      ),
      region,
      credentials,
      payloadSha256: EMPTY_PAYLOAD_SHA256,
      now,
    });
    expect(get.authorization).toContain(
      "Signature=2406727ebb775eceb31cacc9a7824cf1cf2f38182158f4198c04a7eeb578b248"
    );
  });

  it("encodes every path segment once, RFC 3986 style", () => {
    expect(objectPath("zone", "a b/c(d)!/é")).toBe(
      "/zone/a%20b/c%28d%29%21/%C3%A9"
    );
  });

  it("never puts the secret in what it returns", () => {
    const headers = signS3Request({
      method: "DELETE",
      url: new URL("https://de-s3.storage.bunnycdn.com/zone/key"),
      region: "de",
      credentials,
      payloadSha256: EMPTY_PAYLOAD_SHA256,
      now,
    });
    expect(JSON.stringify(headers)).not.toContain(credentials.secretAccessKey);
  });
});
