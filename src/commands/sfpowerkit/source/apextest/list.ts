import { AnyJson } from "@salesforce/ts-types";
import { existsSync } from 'fs';
import { core, flags, SfdxCommand } from "@salesforce/command";
import { SFPowerkit, LoggerLevel } from "../../../../sfpowerkit";
import { SfdxError } from "@salesforce/core";
import ApexTypeFetcher, {
  ApexSortedByType,
} from "../../../../impl/parser/ApexTypeFetcher";

// Initialize Messages with the current plugin directory
core.Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = core.Messages.loadMessages(
  "sfpowerkit",
  "source_apextest_list"
);

export default class List extends SfdxCommand {
  // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
  protected static requiresProject = true;
  public static description = messages.getMessage("commandDescription");

  public static examples = [
    `$ sfdx sfpowerkit:source:apextest:list -p force-app`,
  ];

  protected static flagsConfig = {
    path: flags.string({
      required: true,
      char: "p",
      description: messages.getMessage("pathFlagDescription"),
    }),
    resultasstring: flags.boolean({
      description: messages.getMessage("resultasstringDescription"),
      required: false,
    }),
    loglevel: flags.enum({
      description: messages.getMessage("loglevel"),
      default: "info",
      required: false,
      options: [
        "trace",
        "debug",
        "info",
        "warn",
        "error",
        "fatal",
        "TRACE",
        "DEBUG",
        "INFO",
        "WARN",
        "ERROR",
        "FATAL",
      ],
    }),
  };

  public async run(): Promise<AnyJson> {
    SFPowerkit.setLogLevel(this.flags.loglevel, this.flags.json);

    //set apex class directory
    if (!existsSync(this.flags.path)) {
      throw new SfdxError(
        `path ${this.flags.path} does not exist. you must provide a valid path.`
      );
    }

    let apexTypeFetcher: ApexTypeFetcher = new ApexTypeFetcher();
    let apexSortedByType: ApexSortedByType = apexTypeFetcher.getApexTypeOfClsFiles(
      this.flags.path
    );

    let testClasses = apexSortedByType["testClass"];

    if (testClasses.length > 0) {
      SFPowerkit.log(
        `Found ${testClasses.length} apex test classes in ${this.flags.path}`,
        LoggerLevel.INFO
      );
      this.ux.table(testClasses, ["name", "filepath"]);
    } else {
      SFPowerkit.log(
        `No apex test classes found in ${this.flags.path}`,
        LoggerLevel.INFO
      );
    }

    let testClassesList = testClasses.map((cls) => cls.name);

    return this.flags.resultasstring
      ? testClassesList.join(",")
      : testClassesList;
  }
}
