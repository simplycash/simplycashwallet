import { NgModule } from '@angular/core'
import { IonicPageModule } from 'ionic-angular'
import { SweepPage } from './sweep'
import { ComponentsModule } from '../../components/components.module'
import { PipesModule } from '../../pipes/pipes.module'
import { TranslateModule } from '@ngx-translate/core';

@NgModule({
  declarations: [
    SweepPage,
  ],
  imports: [
    IonicPageModule.forChild(SweepPage),
    TranslateModule.forChild(),
    ComponentsModule,
    PipesModule
  ],
})
export class SweepPageModule {}
