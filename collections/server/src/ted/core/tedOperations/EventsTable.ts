import * as myTypes from "../../services/utils/myTypes";
import { createTable } from "../../services/database/operations/baseOperations";
import { SaveOperation, tableCreationError } from "../../services/database/operations/baseOperations";


export class SaveEventStore extends SaveOperation
{
  /**
   * Represents a save operation on an EventStore.
   * 
   * Uses an existing operation description to build a log that will be stored in the appropriate EventStore.
   * 
   * @constructs SaveEventStore
   * @augments SaveOperation
   * 
   * @param {myTypes.InternalOperationDescription} operation the operation to log in the EventStore.
   */

  constructor(operation:myTypes.InternalOperationDescription)
  {
    super({
      action: myTypes.action.save,
      opID: operation.opID,
      collections: operation.collections,
      documents: operation.documents,
      encObject: SaveEventStore.createLog(operation)
    });
    this.canCreateTable = true;
    this.table = this.buildTableName();
    this.buildOperation();
  }

  public async execute():Promise<myTypes.ServerAnswer>
  {
    let res = await super.execute()
    .catch(async (err:myTypes.CQLResponseError) =>
    {

      //If the table doesn't exist, creates it and throws an error (cancel the operation, it will be retried after the table creation).
      if((err.code === 8704 && err.message.substr(0,18) === "unconfigured table") || err.message.match(/^Collection ([a-zA-z_]*) does not exist./))
      {
        await this.createTable();
        throw tableCreationError;
      }
      //Else returns the error as the DB response.
      console.error(err.message);
      return {status:"error", error:err.message};
    });
    this.done();
    return res;
  }
  
  public done():void { console.log("---EventStore write OK"); }

  public buildTableName():string
  {
    return super.buildTableName() + "__events";
  }

  protected static createLog(operation:myTypes.InternalOperationDescription):string
  {
    let copy:myTypes.InternalOperationDescription = {...operation};
    delete copy.clearObject;
    return JSON.stringify(copy);
  }

  protected buildEntry():myTypes.DBentry
  {
    try
    {
      let entry:myTypes.DBentry = {};
      for(let i:number = 0; i < this.documents.length - 1; i++)
      {
        entry[this.collections[i]] = this.documents[i];
      }
      entry["op_id"] = this.opID;
      entry["object"] = this.object;
      return entry;
    }
    catch(err)
    {
      throw new Error("Wrong collection/document arguments in operation :" + err);
    }
  }

  public async createTable():Promise<void>
  {
    let tableDefinition:myTypes.TableDefinition = {
      name: this.buildTableName(),
      keys : ["op_id", "object"],
      types : ["timeuuid", "text"],
      primaryKey: []
    }
    for(let i:number = 0; i<this.collections.length - 1; i++)
    {
      tableDefinition.keys.push(this.collections[i]);
      tableDefinition.primaryKey.push(this.collections[i]);
      tableDefinition.types.push("uuid");
    }
    tableDefinition.primaryKey.push("op_id");
    return createTable(tableDefinition);
  }
}
