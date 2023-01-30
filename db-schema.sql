-- SEQUENCE: inboundfaxing."Vendor_ID_seq"

-- DROP SEQUENCE inboundfaxing."Vendor_ID_seq";

CREATE SEQUENCE inboundfaxing."Vendor_ID_seq";


CREATE TABLE inboundfaxing."Vendor"
(
	"ID" smallint NOT NULL DEFAULT nextval('inboundfaxing."Vendor_ID_seq"'),
	"Created" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"CreatedBy" character varying(50) COLLATE pg_catalog."default",
	"Name" character varying(50) COLLATE pg_catalog."default" NOT NULL,
	"Deleted" timestamp with time zone,
	"DeletedBy" character varying(50) COLLATE pg_catalog."default",
	"Lastmodified" timestamp with time zone,
	"LastmodifiedBy" character varying(50) COLLATE pg_catalog."default",
	CONSTRAINT "Vendor_pkey" PRIMARY KEY ("ID"),
	CONSTRAINT "Vendor_name_uniquekey" UNIQUE ("Name")
)
WITH (
	OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE inboundfaxing."Vendor"
	OWNER to inboundfaxing;


-- Table: inboundfaxing."FaxInfo"

-- DROP TABLE inboundfaxing."FaxInfo";

CREATE TABLE inboundfaxing."FaxInfo"
(
	"FaxID" uuid NOT NULL,
	"Filename" character varying(200) COLLATE pg_catalog."default",
	"GoodPageCount" smallint,
	"BadPageCount" smallint,
	"FromFaxNumber" character varying(50) COLLATE pg_catalog."default",
	"ToFaxNumber" character varying(50) COLLATE pg_catalog."default",
	"TimezoneOffset" smallint,
	"TransmissionStatus" character varying(200) COLLATE pg_catalog."default",
	"VendorFaxID" character varying(300) COLLATE pg_catalog."default" NOT NULL,
	"VendorMetadata" character varying(4000) COLLATE pg_catalog."default",
	"TransmissionDuration" smallint,
	"FaxReceivedTimestamp" timestamp without time zone,
	"CallerANI" character varying(100) COLLATE pg_catalog."default",
	"RemoteID" character varying(100) COLLATE pg_catalog."default",
	"LastSentForProcessing" timestamp without time zone,
	"StopProcessingYN" boolean,
	"ProcessAttempts" smallint,
	"VendorID" smallint NOT NULL,
	"Created" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"CreatedBy" character varying(50) COLLATE pg_catalog."default",
	"Deleted" timestamp with time zone,
	"DeletedBy" character varying(50) COLLATE pg_catalog."default",
	"LastModified" timestamp with time zone,
	"LastModifiedBy" character varying(50) COLLATE pg_catalog."default",
	"ProcessStatus" boolean,
	"RetryCount" integer DEFAULT 0,
	"FaxUploadedYN" character varying(10) COLLATE pg_catalog."default" DEFAULT 'N'::character varying,
	"FaxPartialFlag" boolean DEFAULT false,
	CONSTRAINT "FaxInfo_pkey" PRIMARY KEY ("VendorID", "VendorFaxID"),
	CONSTRAINT "FaxInfo_faxid_uniquekey" UNIQUE ("FaxID")
)
WITH (
	OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE inboundfaxing."FaxInfo"
	OWNER to inboundfaxing;



-- Add startup data to postgres "Vendor" Table
INSERT INTO inboundfaxing."Vendor" ("Name") VALUES ('Concord');
INSERT INTO inboundfaxing."Vendor" ("Name") VALUES ('TestVendor');


-- Table: inboundfaxing."ReprocessFaxes"

-- DROP TABLE inboundfaxing."ReprocessFaxes";
CREATE TABLE inboundfaxing."ReprocessFaxes"
(
	"ProccessedTime" character varying(50) COLLATE pg_catalog."default" NOT NULL,
	"Created" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"CreatedBy" character varying(50) COLLATE pg_catalog."default",
	"Deleted" timestamp with time zone,
	"DeletedBy" character varying(50) COLLATE pg_catalog."default",
	"Lastmodified" timestamp with time zone,
	"LastmodifiedBy" character varying(50) COLLATE pg_catalog."default",
	CONSTRAINT "ReprocessFaxes_pkey" PRIMARY KEY ("ProccessedTime")
)
WITH (
	OIDS = FALSE
)
TABLESPACE pg_default;
